import {SafetyRadar} from '../components/SafetyRadar';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Linking,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
  useColorScheme,
  Share,
  Image,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import Clipboard from '@react-native-clipboard/clipboard';

import { RootStackParamList, StartSessionResult, LocationSample, FamilyContact } from '../types';
import { COLORS, ACTIVE_SESSION_KEY } from '../constants';
import authService from '../services/authService';
import functionsService from '../services/functionsService';
import locationService from '../services/locationService';
import familyContactsService from '../services/familyContactsService';
import smsService from '../services/smsService';
import stationaryDetector, { StationaryEvent } from '../services/stationaryDetector';
import { SosButton } from '../components/SosButton';
import { QuickToolsBar } from '../components/QuickToolsBar';
import { JourneyPresets, PresetItem } from '../components/JourneyPresets';
import { SirenModal } from '../components/SirenModal';
import { FakeCallModal } from '../components/FakeCallModal';
import { HelplineModal } from '../components/HelplineModal';
import { AreYouOkayModal } from '../components/AreYouOkayModal';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export const HomeScreen: React.FC<Props> = ({ navigation, route }) => {
  const isDark = useColorScheme() === 'dark';


  // ─── State Management ─────────────────────────────────────────────────
  const [isSignedIn, setIsSignedIn] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [sessionActive, setSessionActive] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sosEventKey, setSosEventKey] = useState<string | null>(null);
  const [nextCheckInAt, setNextCheckInAt] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);

  const [sosBusy, setSosBusy] = useState<boolean>(false);
  const [locationBusy, setLocationBusy] = useState<boolean>(false);
  const [restoringSession, setRestoringSession] = useState<boolean>(true);
  const [localReminderEnabled, setLocalReminderEnabled] = useState<boolean>(true);
  const [lastLocation, setLastLocation] = useState<LocationSample | null>(null);
  const [locationStatusText, setLocationStatusText] = useState<string>('Location standby');

  // Interactive Toolkit & Modals state
  const [showSiren, setShowSiren] = useState<boolean>(false);
  const [showFakeCall, setShowFakeCall] = useState<boolean>(false);
  const [showHelplines, setShowHelplines] = useState<boolean>(false);
  const [contactsCount, setContactsCount] = useState<number>(0);

  // Inactivity & Stationary Monitoring State
  const [showAreYouOkay, setShowAreYouOkay] = useState<boolean>(false);
  const [stationaryMinutes, setStationaryMinutes] = useState<number>(4);
  const [familyContacts, setFamilyContacts] = useState<FamilyContact[]>([]);

  // Timer reference for auto-expiry
  const expiryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const unsubscribeLocationRef = useRef<(() => void) | null>(null);
  const sessionActiveRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
    sessionIdRef.current = sessionId;
  }, [sessionActive, sessionId]);

  // ─── Location Permission Helper ──────────────────────────────────────
  const requestLocationPermissions = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION, PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]);
        return granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === 'granted';

      } catch (err) {
        console.warn('Failed to request location permission:', err);
        return false;
      }
    }
    return true;
  };

  // ─── Clear Expiry Timer ──────────────────────────────────────────────
  const clearExpiryTimer = () => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  };

  // ─── Schedule Auto-Expiry Timer ───────────────────────────────────────
  const scheduleAutoExpiry = useCallback((expiresAtIso: string) => {
    clearExpiryTimer();
    const expiryTimeMs = new Date(expiresAtIso).getTime();
    const nowMs = Date.now();
    const delayMs = expiryTimeMs - nowMs;

    if (delayMs <= 0) {
      handleSessionExpired();
      return;
    }

    expiryTimerRef.current = setTimeout(() => {
      handleSessionExpired();
    }, delayMs);
  }, []);

  const handleSessionExpired = async () => {
    try {
      clearExpiryTimer();
      stationaryDetector.stop();
      locationService.stopTracking();
      await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
      setSessionActive(false);
      setSessionId(null);
      setNextCheckInAt(null);
      setSessionExpiresAt(null);
      setLocationStatusText('Session expired automatically');
      Alert.alert(
        'Session Expired',
        'Your Marg Rakshak safety session has expired according to its planned duration.',
      );
    } catch (err) {
      console.warn('Error handling session expiration:', err);
    }
  };

  // ─── Restore Session from AsyncStorage ────────────────────────────────
  const restoreSession = useCallback(async () => {
    setRestoringSession(true);
    try {
      const storedSessionId = await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
      if (storedSessionId) {
        if (storedSessionId.startsWith('{')) {
          const saved: StartSessionResult = JSON.parse(storedSessionId);
          const remaining = Date.parse(saved.expiresAt) - Date.now();
          if (remaining <= 0) { await AsyncStorage.removeItem(ACTIVE_SESSION_KEY); return; }
          setSessionId(saved.sessionId);
          setSessionActive(true);
          setSessionExpiresAt(saved.expiresAt);
          setNextCheckInAt(saved.nextCheckInAt);
          locationService.startTracking(saved.sessionId, Math.ceil(remaining / 60000), saved.nextCheckInAt, saved.expiresAt, saved.phones);
          scheduleAutoExpiry(saved.expiresAt);
          return;
        }
        const active = await functionsService.getSession(storedSessionId);
        if (active && active.status === 'active') {
          const isExpired = new Date(active.expires_at).getTime() <= Date.now();
          if (isExpired) {
            await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
            setSessionActive(false);
          } else {
            setSessionId(active.id);
            setSessionActive(true);
            setNextCheckInAt(active.next_check_in_at);
            setSessionExpiresAt(active.expires_at);
            setLocationStatusText('Tracking resumed for active session');

            // Resume location tracking
            locationService.startTracking(
              active.id,
              30, // approximate duration fallback
              active.next_check_in_at,
              active.expires_at,
            );
            scheduleAutoExpiry(active.expires_at);
          }
        } else {
          await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
          setSessionActive(false);
        }
      }
    } catch (err) {
      console.warn('Error restoring session:', err);
    } finally {
      setRestoringSession(false);
    }
  }, [scheduleAutoExpiry]);

  // ─── Check Auth Status & Load Family Contacts ─────────────────────────
  const checkAuth = useCallback(async () => {
    try {
      // 1. Always load local family contacts for SIM SMS
      const fam = await familyContactsService.getContacts();
      setFamilyContacts(fam);
      const activeFamCount = fam.filter(c => c.isSelected).length;

      // 2. Check cloud session if available
      const session = await authService.getSession();
      if (session?.user) {
        setIsSignedIn(true);
        setUserEmail(session.user.email ?? 'Active user');
        try {
          const list = await functionsService.listContacts();
          setContactsCount(activeFamCount + list.length);
        } catch {
          setContactsCount(activeFamCount);
        }
      } else {
        setIsSignedIn(false);
        setUserEmail(null);
        setContactsCount(activeFamCount);
      }
    } catch {
      setIsSignedIn(false);
      setUserEmail(null);
      setContactsCount(0);
    }
  }, []);

  // ─── Refresh auth & session on screen focus ───────────────────────────


  // ─── On Mount: Initial check, stationary & location subscription ────────
  useEffect(() => {
    checkAuth();
    restoreSession();

    // Subscribe to stationary / inactivity detector
    const unsubStationary = stationaryDetector.onStationary((evt: StationaryEvent) => {
      setStationaryMinutes(evt.stationaryDurationMinutes);
      setShowAreYouOkay(true);
    });

    // Subscribe to location updates
    unsubscribeLocationRef.current = locationService.onLocationUpdate(
      async (sample: LocationSample) => {
        setLastLocation(sample);
        const timeStr = new Date(sample.timestamp).toLocaleTimeString();
        setLocationStatusText(`GPS fix: ±${Math.round(sample.accuracy)}m at ${timeStr}`);

        // Evaluate movement for stationary detection
        if (sessionActiveRef.current) {
          stationaryDetector.processLocation(sample);
        }

        // Push live location fix to Supabase if session is active
        if (sessionActiveRef.current && sessionIdRef.current) {
          try {
            await functionsService.updateLocation(
              sessionIdRef.current,
              uuidv4(),
              sample.latitude,
              sample.longitude,
              sample.accuracy,
            );
          } catch (pushErr) {
            console.warn('Background location push failed:', pushErr);
          }
        }
      },
    );

    return () => {
      clearExpiryTimer();
      unsubStationary();
      if (unsubscribeLocationRef.current) {
        unsubscribeLocationRef.current();
        unsubscribeLocationRef.current = null;
      }
    };
  }, [checkAuth, restoreSession]);

  // ─── Handle Navigation Params for newly started session ───────────────
  useEffect(() => {
    const sessionResult = route.params?.sessionResult;
    if (sessionResult && sessionResult.sessionId) {
      const { sessionId: newId, expiresAt, nextCheckInAt: checkInTime } = sessionResult;
      setSessionId(newId);
      setSessionActive(true);
      setNextCheckInAt(checkInTime);
      setSessionExpiresAt(expiresAt);
      setLocationStatusText('Session started, location tracking active');

      AsyncStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(sessionResult)).catch(err =>
        console.warn('Failed to save session ID:', err),
      );

      // Start tracking with accurate duration in minutes
      const durationMins = Math.max(
        1,
        Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000),
      );
      locationService.startTracking(newId, durationMins, checkInTime, expiresAt, sessionResult.phones);
      if (Platform.OS !== 'android') stationaryDetector.start(4, 25);
      scheduleAutoExpiry(expiresAt);

      // Clear params so we don't re-trigger on subsequent renders
      navigation.setParams({ sessionResult: undefined });
    }
  }, [route.params?.sessionResult, scheduleAutoExpiry, navigation]);

  // ─── Session Start Navigation (Offline & SIM SMS Ready) ───────────────
  const handleStartSessionPress = async () => {
    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) {
      Alert.alert(
        'Location Permission Needed',
        'Marg Rakshak requires GPS permission to track your safety session and share your coordinates with family.',
      );
      return;
    }

    const chosen = (await familyContactsService.getContacts()).filter(c => c.isSelected).map(c => c.phoneNumber).sort();
    const saved = await AsyncStorage.getItem('family.quickStart');
    if (Platform.OS === 'android' && chosen.length && saved) {
      const plan = JSON.parse(saved);
      if (JSON.stringify(chosen) === JSON.stringify(plan.phones) && [30,60,120].includes(plan.minutes)
          && await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.SEND_SMS)
          && (Number(Platform.Version) < 33 || await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS))) {
        const now = Date.now();
        navigation.setParams({ sessionResult: { sessionId: uuidv4(), phones: chosen,
          expiresAt: new Date(now + plan.minutes * 60000).toISOString(),
          nextCheckInAt: new Date(now + 900000).toISOString() } });
        return;
      }
    }
    navigation.navigate('SessionSetup');
  };

  // ─── End Session Flow ─────────────────────────────────────────────────
  const handleEndSessionPress = () => {
    if (!sessionId) return;

    Alert.alert(
      'End Safety Session',
      'Are you sure you want to end your active safety session? Your contacts will be informed you are safe.',
      [
        { text: 'Stay Active', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: async () => {
            try {
              setLocationBusy(true);
              stationaryDetector.stop();
              locationService.stopTracking();
              functionsService.endSession(sessionId).catch(() => {});
              clearExpiryTimer();
              await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);

              setSessionActive(false);
              setSessionId(null);
              setNextCheckInAt(null);
              setSessionExpiresAt(null);
              setLocationStatusText('Session ended safely');

              // Send safe arrival notification to family via SIM SMS
              const selectedFam = familyContacts.filter(c => c.isSelected);
              if (selectedFam.length > 0) {
                const userName = userEmail ? userEmail.split('@')[0] : 'Your family member';
                smsService.sendEmergencySmsToFamily(
                  selectedFam,
                  smsService.formatSafeArrivalSms(userName),
                ).catch(() => {});
              }

              Alert.alert('Session Ended', 'Your safety session has concluded.');
            } catch (err: unknown) {
              const msg =
                typeof err === 'object' && err !== null && 'message' in err
                  ? String((err as { message: unknown }).message)
                  : 'Failed to end session cleanly.';
              Alert.alert('Error', msg);
            } finally {
              setLocationBusy(false);
            }
          },
        },
      ],
    );
  };

  // ─── Check-In Flow ────────────────────────────────────────────────────
  const handleCheckIn = async () => {
    if (!sessionId || !sessionActive) {
      Alert.alert('No Active Session', 'Start a session before checking in.');
      return;
    }

    try {
      setLocationBusy(true);
      const eventKey = uuidv4();
      locationService.updateSession(0, true);
      stationaryDetector.resetAnchor(lastLocation);
      try {
        const result = await functionsService.checkIn(sessionId, eventKey);
        if (result.nextCheckInAt) {
          setNextCheckInAt(result.nextCheckInAt);
        }
      } catch {
        // offline session: advance check-in by 15 mins locally
        const nextLocal = new Date(Date.now() + 15 * 60000).toISOString();
        setNextCheckInAt(nextLocal);
      }
      Alert.alert(
        'Check-In Recorded',
        'Thank you for confirming your safety. Stationary monitoring has been reset.',
      );
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Could not record check-in. Please try again.';
      Alert.alert('Check-In Error', msg);
    } finally {
      setLocationBusy(false);
    }
  };

  // ─── Extend Active Session (+15 Minutes) ──────────────────────────────
  const handleExtendSession = async () => {
    if (!sessionActive || !sessionExpiresAt) {
      Alert.alert('No Active Session', 'Start a safety session to extend its duration.');
      return;
    }
    const currentExpiry = new Date(sessionExpiresAt).getTime();
    const newExpiryDate = new Date(currentExpiry + 15 * 60 * 1000);
    const newExpiryIso = newExpiryDate.toISOString();
    const stored = await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
    if (stored?.startsWith('{')) {
      const saved = JSON.parse(stored);
      await AsyncStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ ...saved, expiresAt: newExpiryIso }));
    }
    locationService.updateSession(newExpiryDate.getTime(), false);
    setSessionExpiresAt(newExpiryIso);
    scheduleAutoExpiry(newExpiryIso);
    Alert.alert(
      'Session Extended',
      `Your session has been extended by +15 minutes.\nNew end time: ${newExpiryDate.toLocaleTimeString(
        [],
        { hour: '2-digit', minute: '2-digit' },
      )}.`,
    );
  };

  // ─── Instant GPS Pin Share ─────────────────────────────────────────────
  const handleShareQuickPin = async () => {
    if (!lastLocation) {
      Alert.alert(
        'Acquiring GPS Fix',
        'Fetching your latest coordinates. Please ensure GPS/location access is turned on.',
      );
      return;
    }
    const lat = lastLocation.latitude.toFixed(6);
    const lon = lastLocation.longitude.toFixed(6);
    const accuracy = Math.round(lastLocation.accuracy);
    const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
    const shareMessage = `🚨 Marg Rakshak Emergency Location Pin:\nMy current GPS location is: ${lat}, ${lon} (±${accuracy}m accuracy).\nLive map: ${osmUrl}`;

    try {
      Clipboard.setString(shareMessage);
      await Share.share({
        message: shareMessage,
        title: 'Marg Rakshak GPS Location Pin',
      });
    } catch {
      Alert.alert(
        'GPS Pin Copied',
        'Location coordinates and live OpenStreetMap link copied to clipboard.',
      );
    }
  };

  // ─── Quick Journey Preset Selection ───────────────────────────────────
  const handlePresetSelected = (preset: PresetItem) => {
    navigation.navigate('SessionSetup', {
      presetDuration: preset.durationMinutes,
      presetDestination: preset.destination,
    });
  };

  // ─── Stationary / Inactivity Timeout Escalation ────────────────────────
  const handleInactivityEscalation = async () => {
    const selectedFam = familyContacts.filter(c => c.isSelected);
    const lat = lastLocation?.latitude ?? 0;
    const lon = lastLocation?.longitude ?? 0;
    const accuracy = lastLocation?.accuracy ?? 15;
    const userName = userEmail ? userEmail.split('@')[0] : 'Your family member';

    const smsBody = !lastLocation ? 'Marg Rakshak: no response to check-in. GPS unavailable. Call me now.' : smsService.formatInactivityEmergencySms(
      userName,
      lat,
      lon,
      accuracy,
      stationaryMinutes,
    );

    let sentCount = 0;
    if (selectedFam.length > 0) {
      const res = await smsService.sendEmergencySmsToFamily(selectedFam, smsBody);
      sentCount = res.sentCount;
    }

    Alert.alert(
      '⚠️ Inactivity Alert Dispatched',
      `You did not respond to the safety prompt. An urgent SMS with your GPS location was sent via SIM network to your selected family members (${sentCount} notified) asking them to call you and determine if emergency response (112) should be alerted.`,
      [
        {
          text: 'I Am Safe Now',
          style: 'cancel',
          onPress: () => {
            stationaryDetector.resetAnchor(lastLocation);
          },
        },
        {
          text: 'CALL 112 NOW',
          style: 'destructive',
          onPress: () => Linking.openURL('tel:112'),
        },
      ],
    );
  };

  // ─── SOS Trigger Flow (Direct SIM SMS First) ───────────────────────────
  const handleSosTriggered = async () => {
    if (sosBusy) return;
    setSosBusy(true);

    const eventKey = uuidv4();
    setSosEventKey(eventKey);

    const lat = lastLocation?.latitude ?? 0;
    const lon = lastLocation?.longitude ?? 0;
    const accuracy = lastLocation?.accuracy ?? 15;
    const userName = userEmail ? userEmail.split('@')[0] : 'Your family member';

    // 1. Dispatch emergency SMS to selected family members via SIM network
    const selectedFam = familyContacts.filter(c => c.isSelected);
    let smsSentCount = 0;
    if (selectedFam.length > 0) {
      const sosSms = lastLocation
        ? smsService.formatSosEmergencySms(userName, lat, lon, accuracy) + ' Fix time: ' + new Date(lastLocation.timestamp).toISOString()
        : 'Marg Rakshak SOS: I need help. GPS unavailable. Please call me immediately.';
      const res = await smsService.sendEmergencySmsToFamily(selectedFam, sosSms);
      smsSentCount = res.sentCount;
    }

    // 2. Asynchronously notify backend if active session exists (non-blocking)
    if (sessionActive && sessionId) {
      functionsService.createSos(sessionId, eventKey).catch(err => {
        console.warn('Cloud SOS broadcast fallback notice:', err);
      });
    }

    // 3. Inform user and provide 1-tap ERSS 112 dialer
    const smsNotice =
      smsSentCount > 0
        ? `SOS SMS was submitted to ${smsSentCount} family contact(s) via SIM network.`
        : `No automatic SMS submission confirmed. Check your SIM and selected contacts.`;

    Alert.alert(
      'SOS status',
      `${smsNotice}\n\nDo you want to dial Emergency Services (112) now?`,
      [
        {
          text: 'I am safe now / Dismiss',
          style: 'cancel',
        },
        {
          text: 'CALL 112 NOW',
          style: 'destructive',
          onPress: () => {
            Linking.openURL('tel:112').catch(() => {
              Alert.alert('Dialer Error', 'Could not open phone dialer for 112.');
            });
          },
        },
      ],
    );

    setSosBusy(false);
  };

  // ─── UI Helpers ───────────────────────────────────────────────────────
  const formatTime = (isoString: string | null): string => {
    if (!isoString) return 'Not scheduled';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const dynamicStyles = {
    screenBg: isDark ? '#0F1618' : COLORS.background,
    cardBg: isDark ? '#1A2427' : COLORS.surface,
    textColor: isDark ? '#E2F1EC' : COLORS.textPrimary,
    secondaryText: isDark ? '#98ABB0' : COLORS.textSecondary,
    borderCol: isDark ? '#26373B' : COLORS.border,
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: dynamicStyles.screenBg }]}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.header}>
        <Image source={require('../assets/logo.png')} style={styles.logo} />
        <Text accessibilityRole="header" style={[styles.brand, {color: dynamicStyles.textColor}]}>Marg Rakshak</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Auth')} style={styles.account}>
          <Text style={{color: isDark ? '#AFDCD2' : COLORS.primaryDark}}>{isSignedIn ? 'Account' : 'Sign in'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.session}>
        <View style={styles.sessionIntro}>
          <View style={{flex: 1}}>
            <Text style={styles.kicker}>Safety session</Text>
        <Text accessibilityRole="header" style={styles.headline}>{restoringSession ? 'Checking session…' : sessionActive ? 'Session in progress' : 'Ready to start'}</Text>
          </View>
          <SafetyRadar active={sessionActive}/>
        </View>
        <Text style={styles.description}>{sessionActive ? `Ends at ${formatTime(sessionExpiresAt)} · Next check-in ${formatTime(nextCheckInAt)}` : 'Share your location with selected family contacts by SMS.'}</Text>
        <View style={styles.readings}>
          <View style={styles.reading}><Text style={styles.readingLabel}>GPS accuracy</Text><Text style={styles.readingValue}>{sessionActive && lastLocation && lastLocation.accuracy > 0 ? '±' + Math.round(lastLocation.accuracy) + ' m' : sessionActive ? 'Awaiting fix' : 'Standby'}</Text></View>
          <View style={styles.reading}><Text style={styles.readingLabel}>Family SMS</Text><Text style={styles.readingValue}>{familyContacts.filter(c => c.isSelected).length} selected</Text></View>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled: locationBusy || restoringSession}}
          disabled={locationBusy || restoringSession} onPress={sessionActive ? handleCheckIn : handleStartSessionPress}
          style={[styles.primary, {opacity: locationBusy || restoringSession ? 0.65 : 1}]}>
          {locationBusy || restoringSession ? <ActivityIndicator color="#143E38"/> : <Text style={styles.primaryText}>{sessionActive ? 'Check in · I am okay' : 'Start safety session'}</Text>}
        </TouchableOpacity>
        {sessionActive && <View style={styles.controls}>
          <TouchableOpacity accessibilityRole="button" onPress={handleExtendSession} style={styles.secondary}><Text style={styles.secondaryText}>Extend 15 min</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={handleEndSessionPress} disabled={locationBusy} style={styles.secondary}><Text style={styles.secondaryText}>End session</Text></TouchableOpacity>
        </View>}
      </View>
      <SosButton onActivate={handleSosTriggered} disabled={sosBusy}/>
      {sosBusy && <ActivityIndicator color={COLORS.danger} accessibilityLabel="Sending SOS"/>}
      {sessionActive && <View style={[styles.row, {borderColor: dynamicStyles.borderCol}]}>
        <Text style={[styles.rowTitle, {color: dynamicStyles.textColor}]}>Location</Text>
        <Text style={[styles.rowDetail, {color: dynamicStyles.secondaryText}]}>{locationStatusText}</Text>
      </View>}
      <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Contacts')}
        style={[styles.row, {borderColor: dynamicStyles.borderCol}]}>
        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, {color: dynamicStyles.textColor}]}>Trusted contacts</Text>
          <Text style={[styles.caption, {color: dynamicStyles.secondaryText}]}>{contactsCount ? `${contactsCount} configured` : 'Add or select family contacts'}</Text>
        </View>
        <Text style={[styles.arrow, {color: dynamicStyles.secondaryText}]}>›</Text>
      </TouchableOpacity>
      <QuickToolsBar onOpenSiren={() => setShowSiren(true)} onOpenFakeCall={() => setShowFakeCall(true)}
        onOpenHelpline={() => setShowHelplines(true)} onShareQuickPin={handleShareQuickPin}/>
      {!sessionActive && <JourneyPresets onSelectPreset={handlePresetSelected}/>}
      <Text style={[styles.caption, {color: dynamicStyles.secondaryText}]}>In immediate danger, call 112.</Text>

      {/* ─── Interactive Safety Modals ───────────────────────── */}
      <SirenModal
        visible={showSiren}
        onClose={() => setShowSiren(false)}
      />

      <FakeCallModal
        visible={showFakeCall}
        onClose={() => setShowFakeCall(false)}
      />

      <HelplineModal
        visible={showHelplines}
        onClose={() => setShowHelplines(false)}
      />

      {/* ─── Stationary Inactivity / Non-Response Verification Modal ─── */}
      <AreYouOkayModal
        visible={showAreYouOkay}
        stationaryMinutes={stationaryMinutes}
        countdownSeconds={60}
        onConfirmSafe={() => {
          setShowAreYouOkay(false);
          stationaryDetector.resetAnchor(lastLocation);
          Alert.alert(
            'Safety Confirmed',
            'Glad to hear you are okay! Stationary monitoring has been reset.',
          );
        }}
        onTriggerImmediateSos={() => {
          setShowAreYouOkay(false);
          handleSosTriggered();
        }}
        onTimeout={() => {
          setShowAreYouOkay(false);
          handleInactivityEscalation();
        }}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1},
  scrollContent: {paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center'},
  header: {flexDirection: 'row', alignItems: 'center', gap: 10},
  logo: {width: 32, height: 32, borderRadius: 8},
  brand: {flex: 1, fontSize: 21, fontWeight: '700', letterSpacing: -0.6},
  account: {minHeight: 48, justifyContent: 'center', paddingHorizontal: 8},
  session: {backgroundColor: '#173D39', borderRadius: 16, padding: 20},
  sessionIntro: {flexDirection:'row',alignItems:'center',gap:12,marginBottom:6},
  readings:{marginTop:14,paddingTop:12,borderTopWidth:1,borderColor:'#406059',flexDirection:'row',gap:14},
  reading:{flex:1,gap:2}, readingLabel:{color:'#C1D8CF',fontSize:12}, readingValue:{fontSize:16,color:'#FFFFFF',fontWeight:'600',fontVariant:['tabular-nums']},
  kicker: {fontSize: 14, color: '#C2DAD5', fontWeight: '500'},
  headline: {color: '#FFFFFF', fontSize: 28, fontWeight: '600', letterSpacing: -0.7, marginVertical: 6},
  description: {color: '#D6E5E1', fontSize: 15, lineHeight: 22},
  primary: {minHeight: 50, marginTop: 20, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#E2F1EC'},
  primaryText: {fontSize: 16, color: '#143E38', fontWeight: '700'},
  controls: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between'},
  secondary: {minHeight: 48, justifyContent: 'center', paddingHorizontal: 4},
  secondaryText: {color: '#E2F1EC', fontSize: 15, fontWeight: '600'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1},
  rowBody: {flex: 1, gap: 3},
  rowTitle: {fontSize: 16, fontWeight: '600'},
  rowDetail: {flex: 1, textAlign: 'right', fontSize: 14},
  caption: {fontSize: 14, lineHeight: 20},
  arrow: {fontSize: 24},
});

export default HomeScreen;
