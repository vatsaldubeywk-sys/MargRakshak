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
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
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
import { SafetyRadar } from '../components/SafetyRadar';
import { QuickToolsBar } from '../components/QuickToolsBar';
import { JourneyPresets, PresetItem } from '../components/JourneyPresets';
import { SirenModal } from '../components/SirenModal';
import { FakeCallModal } from '../components/FakeCallModal';
import { HelplineModal } from '../components/HelplineModal';
import { AreYouOkayModal } from '../components/AreYouOkayModal';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export const HomeScreen: React.FC<Props> = ({ navigation, route }) => {
  const isDark = useColorScheme() === 'dark';
  const isFocused = useIsFocused();

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
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Marg Rakshak Location Permission',
            message:
              'Marg Rakshak needs accurate GPS access to share your location with trusted contacts during emergencies.',
            buttonNeutral: 'Ask Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'Grant',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
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
  useFocusEffect(
    useCallback(() => {
      checkAuth();
    }, [checkAuth]),
  );

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

      AsyncStorage.setItem(ACTIVE_SESSION_KEY, newId).catch(err =>
        console.warn('Failed to save session ID:', err),
      );

      // Start tracking with accurate duration in minutes
      const durationMins = Math.max(
        1,
        Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000),
      );
      locationService.startTracking(newId, durationMins, checkInTime, expiresAt);
      stationaryDetector.start(4, 25);
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
              try {
                await functionsService.endSession(sessionId);
              } catch {
                // offline session
              }
              locationService.stopTracking();
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
  const handleExtendSession = () => {
    if (!sessionActive || !sessionExpiresAt) {
      Alert.alert('No Active Session', 'Start a safety session to extend its duration.');
      return;
    }
    const currentExpiry = new Date(sessionExpiresAt).getTime();
    const newExpiryDate = new Date(currentExpiry + 15 * 60 * 1000);
    const newExpiryIso = newExpiryDate.toISOString();
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

    const smsBody = smsService.formatInactivityEmergencySms(
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
      const sosSms = smsService.formatSosEmergencySms(userName, lat, lon, accuracy);
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
        ? `Emergency SMS with your GPS pin was dispatched to ${smsSentCount} family contact(s) via SIM network.`
        : `Emergency SOS triggered. (Configure family contacts in Contacts to enable automated SIM SMS).`;

    Alert.alert(
      '🚨 SOS Emergency Alert Dispatched!',
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
      {/* ─── Header ────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerBrandRow}>
          <Image
            source={require('../assets/logo.png')}
            style={styles.headerLogo}
            accessibilityLabel="Marg Rakshak App Icon"
          />
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.brandTitle, { color: COLORS.primary }]}>
              MARG RAKSHAK
            </Text>
            <Text style={[styles.brandSubtitle, { color: dynamicStyles.secondaryText }]}>
              Your safety, in reach.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.accountButton,
            {
              backgroundColor: isSignedIn ? COLORS.primaryLight : dynamicStyles.cardBg,
              borderColor: COLORS.primary,
            },
          ]}
          onPress={() => navigation.navigate('Auth')}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={isSignedIn ? 'Manage Account' : 'Sign In'}
        >
          <Text style={[styles.accountButtonText, { color: COLORS.primaryDark }]}>
            {isSignedIn ? 'Account' : 'Sign In'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── Interactive Safety Radar Visualizer ─────────────── */}
      <SafetyRadar
        sessionActive={sessionActive}
        nextCheckInAt={nextCheckInAt}
        sessionExpiresAt={sessionExpiresAt}
        gpsAccuracy={lastLocation ? Math.round(lastLocation.accuracy) : undefined}
        contactCount={contactsCount}
        onQuickCheckIn={handleCheckIn}
        onExtendSession={handleExtendSession}
        checkInBusy={locationBusy}
      />

      {/* ─── Emergency Quick Toolkit ────────────────────────── */}
      <QuickToolsBar
        onOpenSiren={() => setShowSiren(true)}
        onOpenFakeCall={() => setShowFakeCall(true)}
        onOpenHelpline={() => setShowHelplines(true)}
        onShareQuickPin={handleShareQuickPin}
      />

      {/* ─── 1-Tap Journey Presets (Visible when idle) ───────── */}
      {!sessionActive && (
        <JourneyPresets onSelectPreset={handlePresetSelected} />
      )}

      {/* ─── Session Status Card ────────────────────────────── */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: dynamicStyles.cardBg,
            borderColor: sessionActive ? COLORS.primary : dynamicStyles.borderCol,
          },
        ]}
      >
        <View style={styles.cardHeaderRow}>
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: sessionActive
                  ? COLORS.primaryLight
                  : isDark
                  ? '#2B383C'
                  : '#E6ECEB',
              },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: sessionActive ? COLORS.primary : COLORS.textMuted,
                },
              ]}
            />
            <Text
              style={[
                styles.statusPillText,
                {
                  color: sessionActive ? COLORS.primaryDark : dynamicStyles.secondaryText,
                },
              ]}
            >
              {sessionActive ? 'SESSION ACTIVE' : 'NO ACTIVE SESSION'}
            </Text>
          </View>

          {restoringSession ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : null}
        </View>

        <Text style={[styles.cardHeadline, { color: dynamicStyles.textColor }]}>
          {sessionActive
            ? 'Safety tracking in progress'
            : 'Step out with confidence'}
        </Text>
        <Text style={[styles.cardDescription, { color: dynamicStyles.secondaryText }]}>
          {sessionActive
            ? `Your location is shared with your trusted contacts until ${formatTime(
                sessionExpiresAt,
              )}.`
            : 'Plan a safety session before traveling alone, commuting late, or entering unfamiliar areas.'}
        </Text>

        <TouchableOpacity
          style={[
            styles.sessionButton,
            {
              backgroundColor: sessionActive ? COLORS.danger : COLORS.primary,
            },
          ]}
          onPress={sessionActive ? handleEndSessionPress : handleStartSessionPress}
          disabled={locationBusy || restoringSession}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={
            sessionActive ? 'End active safety session' : 'Start new safety session'
          }
        >
          {locationBusy ? (
            <ActivityIndicator color={COLORS.surface} />
          ) : (
            <Text style={styles.sessionButtonText}>
              {sessionActive ? 'End safety session' : 'Start a safety session'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ─── Status Labels ──────────────────────────────────── */}
      <View
        style={[
          styles.infoTile,
          { backgroundColor: dynamicStyles.cardBg, borderColor: dynamicStyles.borderCol },
        ]}
      >
        <View style={styles.statusRow}>
          <Text style={[styles.statusLabelTitle, { color: dynamicStyles.textColor }]}>
            GPS Status:
          </Text>
          <Text
            style={[styles.statusLabelVal, { color: COLORS.primary }]}
            accessibilityLiveRegion="polite"
          >
            {locationStatusText}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: dynamicStyles.borderCol }]} />

        <View style={styles.statusRow}>
          <Text style={[styles.statusLabelTitle, { color: dynamicStyles.textColor }]}>
            Next Check-in:
          </Text>
          <Text
            style={[styles.statusLabelVal, { color: dynamicStyles.textColor }]}
            accessibilityLiveRegion="polite"
          >
            {sessionActive ? formatTime(nextCheckInAt) : 'Inactive'}
          </Text>
        </View>
      </View>

      {/* ─── Check-In Action Button ─────────────────────────── */}
      <TouchableOpacity
        style={[
          styles.checkInButton,
          {
            backgroundColor: sessionActive ? COLORS.accent : isDark ? '#233034' : '#DDE6E4',
          },
        ]}
        onPress={handleCheckIn}
        disabled={!sessionActive || locationBusy}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Check in to confirm you are safe"
      >
        <Text
          style={[
            styles.checkInButtonText,
            { color: sessionActive ? COLORS.surface : COLORS.textMuted },
          ]}
        >
          ✓ Check In (I Am Safe)
        </Text>
      </TouchableOpacity>

      {/* ─── Manage Contacts Card ───────────────────────────── */}
      <TouchableOpacity
        style={[
          styles.card,
          styles.contactsCard,
          {
            backgroundColor: dynamicStyles.cardBg,
            borderColor: dynamicStyles.borderCol,
          },
        ]}
        onPress={() => navigation.navigate('Contacts')}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Manage trusted contacts"
      >
        <View>
          <Text style={[styles.cardHeadline, { color: dynamicStyles.textColor }]}>
            Add someone you trust
          </Text>
          <Text style={[styles.cardDescription, { color: dynamicStyles.secondaryText }]}>
            Invite family and friends to receive automated alerts and check-in notices.
          </Text>
        </View>
        <Text style={[styles.navArrow, { color: COLORS.primary }]}>➔</Text>
      </TouchableOpacity>

      {/* ─── Safety-Critical SOS Button ─────────────────────── */}
      <View style={styles.sosContainer}>
        <SosButton
          onActivate={handleSosTriggered}
          disabled={sosBusy}
        />
        {sosBusy ? (
          <ActivityIndicator
            size="small"
            color={COLORS.danger}
            style={styles.sosIndicator}
          />
        ) : null}
      </View>

      {/* ─── Footer Disclaimer ──────────────────────────────── */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: dynamicStyles.secondaryText }]}>
          Emergency alerts and stationary warnings are transmitted directly to your selected
          family contacts via SIM cellular network. In immediate danger, call national
          emergency response (112) directly.
        </Text>
      </View>

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
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: Platform.OS === 'android' ? 10 : 0,
  },
  headerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    marginRight: 12,
  },
  headerTitleWrap: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  brandSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  accountButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  accountButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardHeadline: {
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  sessionButton: {
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionButtonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  infoTile: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  statusLabelTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusLabelVal: {
    fontSize: 14,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginVertical: 8,
  },
  checkInButton: {
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkInButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  contactsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
  },
  navArrow: {
    fontSize: 22,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  sosContainer: {
    marginTop: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  sosIndicator: {
    marginTop: 8,
  },
  footer: {
    marginTop: 10,
    paddingHorizontal: 12,
  },
  footerText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});

export default HomeScreen;
