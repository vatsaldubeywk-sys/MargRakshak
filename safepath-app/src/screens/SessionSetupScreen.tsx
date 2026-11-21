import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { v4 as uuidv4 } from 'uuid';
import { RootStackParamList, SelectableContact, FamilyContact } from '../types';
import { COLORS } from '../constants';
import authService from '../services/authService';
import functionsService from '../services/functionsService';
import familyContactsService from '../services/familyContactsService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import smsService from '../services/smsService';

type Props = NativeStackScreenProps<RootStackParamList, 'SessionSetup'>;

const DURATION_OPTIONS = [30, 60, 120];

export const SessionSetupScreen: React.FC<Props> = ({ navigation, route }) => {
  const isDark = useColorScheme() === 'dark';

  const presetDur = route.params?.presetDuration;
  const presetDest = route.params?.presetDestination;

  const initialDuration = presetDur
    ? ([30, 60, 120].includes(presetDur) ? presetDur : (presetDur <= 45 ? 60 : 120))
    : 30;

  const [durationMinutes, setDurationMinutes] = useState<number>(initialDuration);
  const [destination, setDestination] = useState<string>(presetDest ?? '');
  const [contacts, setContacts] = useState<SelectableContact[]>([]);
  const [familyContacts, setFamilyContacts] = useState<FamilyContact[]>([]);
  const [hasConsented, setHasConsented] = useState<boolean>(false);
  const [loadingContacts, setLoadingContacts] = useState<boolean>(true);
  const [startingSession, setStartingSession] = useState<boolean>(false);

  // ─── Fetch Contacts on Mount ─────────────────────────────────────────
  const fetchContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      // 1. Fetch offline-first family phone contacts
      const localFamily = await familyContactsService.getContacts();
      setFamilyContacts(localFamily);

      // 2. Try fetching cloud contacts if signed in
      const signedIn = await authService.isSignedIn();
      if (signedIn) {
        try {
          const list = await functionsService.listContacts();
          const acceptedList = list
            .filter(c => c.status === 'accepted')
            .map(c => ({
              ...c,
              isSelected: true,
            }));
          setContacts(acceptedList);
        } catch {
          // non-blocking
        }
      }
    } catch (err: unknown) {
      console.warn('Could not load contacts:', err);
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // ─── Toggle Family Contact Selection ─────────────────────────────────
  const toggleFamilySelection = async (id: string) => {
    const updated = await familyContactsService.toggleContactSelection(id);
    setFamilyContacts(updated);
  };

  // ─── Toggle Cloud Contact Selection ──────────────────────────────────
  const toggleContactSelection = (contactId: string) => {
    setContacts(prev =>
      prev.map(c =>
        c.id === contactId ? { ...c, isSelected: !c.isSelected } : c,
      ),
    );
  };

  // ─── Start Session Handler ────────────────────────────────────────────
  const handleStartSession = async () => {
    const selectedFamily = familyContacts.filter(c => c.isSelected);
    const selectedCloudIds = contacts.filter(c => c.isSelected).map(c => c.id);

    if (selectedFamily.length === 0) {
      Alert.alert(
        'Select at least 1 contact',
        'You must configure at least one active family contact to receive SIM SMS alerts when you need help.',
        [
          {
            text: 'Add Family Contact',
            onPress: () => navigation.navigate('Contacts'),
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    // 2. Validate Consent
    if (!hasConsented) {
      Alert.alert(
        'Consent Required',
        'Please review and agree to share your location updates and alert your selected family contacts if you stop moving or trigger SOS.',
      );
      return;
    }

    if (Platform.OS === 'android') {
      const p = PermissionsAndroid.PERMISSIONS;
      const required = [p.ACCESS_COARSE_LOCATION, p.ACCESS_FINE_LOCATION, p.SEND_SMS];
      const grants = await PermissionsAndroid.requestMultiple(required);
      if (grants[p.ACCESS_FINE_LOCATION] !== 'granted' || grants[p.SEND_SMS] !== 'granted' ||
          (Number(Platform.Version) >= 33 && await PermissionsAndroid.request(p.POST_NOTIFICATIONS) !== 'granted')) {
        Alert.alert('Session requires permissions', 'Enable precise location, SMS and notifications in Android settings to start.');
        return;
      }
    }
    setStartingSession(true);

    try {
      let result = {
        sessionId: uuidv4(),
        expiresAt: new Date(Date.now() + durationMinutes * 60000).toISOString(),
        nextCheckInAt: new Date(Date.now() + Math.min(15, durationMinutes) * 60000).toISOString(),
      };

      // Try starting cloud session if token is available
      try {
        const token = await authService.getAccessToken();
        if (token && selectedCloudIds.length > 0) {
          result = await functionsService.startSession(
            durationMinutes,
            selectedCloudIds,
            destination.trim(),
          );
        }
      } catch {
        // Offline-first mode: fallback to local session
      }

      await AsyncStorage.setItem('family.quickStart', JSON.stringify({
        minutes: durationMinutes, phones: selectedFamily.map(c => c.phoneNumber).sort(),
      }));
      // Notify family contacts via SIM SMS
      if (selectedFamily.length > 0) {
        const startMsg = smsService.formatSessionStartSms(
          'Your family member',
          destination.trim(),
        );
        smsService.sendEmergencySmsToFamily(selectedFamily, startMsg).catch(() => {});
      }

      // Navigate back to Home with result params
      navigation.navigate('Home', { sessionResult: { ...result, phones: selectedFamily.map(c => c.phoneNumber) } });
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to initiate safety session.';
      Alert.alert('Session Start Error', msg);
    } finally {
      setStartingSession(false);
    }
  };

  const dynamicStyles = {
    screenBg: isDark ? '#0F1618' : COLORS.background,
    cardBg: isDark ? '#192427' : COLORS.surface,
    textColor: isDark ? '#E2F1EC' : COLORS.textPrimary,
    secondaryText: isDark ? '#98ABB0' : COLORS.textSecondary,
    borderCol: isDark ? '#26373B' : COLORS.border,
    inputBg: isDark ? '#141E21' : COLORS.surface,
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: dynamicStyles.screenBg }]}
      contentContainerStyle={styles.scrollContent}
    >
      {/* ─── Header ────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: dynamicStyles.textColor }]}>
          Plan your session
        </Text>
        <Text style={[styles.subtitle, { color: dynamicStyles.secondaryText }]}>
          Choose how long to share your location and who receives updates.
        </Text>
      </View>

      {/* ─── Duration Selector ──────────────────────────────── */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: dynamicStyles.cardBg,
            borderColor: dynamicStyles.borderCol,
          },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: dynamicStyles.textColor }]}>
          Duration
        </Text>

        <View style={styles.durationButtonGroup}>
          {DURATION_OPTIONS.map(mins => {
            const isSelected = durationMinutes === mins;
            return (
              <TouchableOpacity
                key={mins}
                style={[
                  styles.durationButton,
                  {
                    backgroundColor: isSelected
                      ? COLORS.primary
                      : isDark
                      ? '#223035'
                      : '#EBF2F0',
                    borderColor: isSelected ? COLORS.primaryDark : dynamicStyles.borderCol,
                  },
                ]}
                onPress={() => setDurationMinutes(mins)}
                accessible={true}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${mins} minutes duration`}
              >
                <Text
                  style={[
                    styles.durationButtonText,
                    {
                      color: isSelected ? COLORS.surface : dynamicStyles.textColor,
                    },
                  ]}
                >
                  {mins >= 60 ? `${mins / 60} hr${mins > 60 ? 's' : ''}` : `${mins} min`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ─── Destination Input (Optional) ───────────────────── */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: dynamicStyles.cardBg,
            borderColor: dynamicStyles.borderCol,
          },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: dynamicStyles.textColor }]}>
          Destination (Optional)
        </Text>
        <TextInput
          style={[
            styles.destinationInput,
            {
              backgroundColor: dynamicStyles.inputBg,
              borderColor: dynamicStyles.borderCol,
              color: dynamicStyles.textColor,
            },
          ]}
          placeholder="e.g. Metro Station, Home, Office"
          placeholderTextColor={COLORS.textMuted}
          value={destination}
          onChangeText={setDestination}
          accessible={true}
          accessibilityLabel="Destination text input"
        />
      </View>

      {/* ─── Accepted Contacts Section ──────────────────────── */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: dynamicStyles.cardBg,
            borderColor: dynamicStyles.borderCol,
          },
        ]}
      >
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: dynamicStyles.textColor }]}>
            ACCEPTED CONTACTS
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Contacts')}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Manage trusted contacts"
          >
            <Text style={[styles.linkText, { color: COLORS.primary }]}>
              + Manage
            </Text>
          </TouchableOpacity>
        </View>

        {loadingContacts ? (
          <ActivityIndicator
            size="small"
            color={COLORS.primary}
            style={styles.loadingMargin}
          />
        ) : familyContacts.length === 0 && contacts.length === 0 ? (
          <View style={styles.noContactsBox}>
            <Text style={[styles.noContactsText, { color: COLORS.warningText }]}>
              No emergency contacts found. Add trusted family contacts first!
            </Text>
            <TouchableOpacity
              style={[styles.smallAddBtn, { backgroundColor: COLORS.primary }]}
              onPress={() => navigation.navigate('Contacts')}
            >
              <Text style={styles.smallAddBtnText}>Add Family Contacts</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {familyContacts.map(fc => (
              <TouchableOpacity
                key={fc.id}
                style={[
                  styles.contactRow,
                  { borderBottomColor: dynamicStyles.borderCol },
                ]}
                onPress={() => toggleFamilySelection(fc.id)}
                accessible={true}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: fc.isSelected }}
                accessibilityLabel={`Select family contact ${fc.name}`}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: fc.isSelected ? COLORS.primary : COLORS.textMuted,
                      backgroundColor: fc.isSelected ? COLORS.primary : 'transparent',
                    },
                  ]}
                >
                  {fc.isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>

                <View style={styles.contactDetails}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text
                      style={[styles.contactName, { color: dynamicStyles.textColor, marginRight: 8 }]}
                    >
                      {fc.name}
                    </Text>
                    <View style={{ backgroundColor: '#E0E7FF', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                      <Text style={{ fontSize: 10, color: '#3730A3', fontWeight: '700' }}>{fc.relationship} (SIM SMS)</Text>
                    </View>
                  </View>
                  <Text
                    style={[styles.contactEmail, { color: dynamicStyles.secondaryText }]}
                  >
                    {fc.phoneNumber}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            {contacts.map(contact => (
              <TouchableOpacity
                key={contact.id}
                style={[
                  styles.contactRow,
                  { borderBottomColor: dynamicStyles.borderCol },
                ]}
                onPress={() => toggleContactSelection(contact.id)}
                accessible={true}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: contact.isSelected }}
                accessibilityLabel={`Select contact ${contact.display_name}`}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: contact.isSelected ? COLORS.primary : COLORS.textMuted,
                      backgroundColor: contact.isSelected ? COLORS.primary : 'transparent',
                    },
                  ]}
                >
                  {contact.isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>

                <View style={styles.contactDetails}>
                  <Text
                    style={[styles.contactName, { color: dynamicStyles.textColor }]}
                  >
                    {contact.display_name}
                  </Text>
                  <Text
                    style={[styles.contactEmail, { color: dynamicStyles.secondaryText }]}
                  >
                    {contact.invited_email}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </View>

      {/* ─── Consent Checkbox Section ───────────────────────── */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: dynamicStyles.cardBg,
            borderColor: dynamicStyles.borderCol,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.consentRow}
          onPress={() => setHasConsented(prev => !prev)}
          accessible={true}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: hasConsented }}
          accessibilityLabel="Consent agreement checkbox"
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: hasConsented ? COLORS.primary : COLORS.textMuted,
                backgroundColor: hasConsented ? COLORS.primary : 'transparent',
              },
            ]}
          >
            {hasConsented && <Text style={styles.checkmark}>✓</Text>}
          </View>

          <Text
            style={[styles.consentText, { color: dynamicStyles.textColor }]}
          >
            I consent to Marg Rakshak accessing my real-time GPS coordinates and
            sending an SMS with my first GPS fix and every five minutes thereafter, plus emergency alerts, to my selected family. Carrier SMS charges may apply
            for the duration of this session.
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── Start Session Button ───────────────────────────── */}
      <TouchableOpacity
        style={[
          styles.startButton,
          {
            backgroundColor:
              startingSession || !hasConsented || !familyContacts.some(c => c.isSelected)
                ? isDark
                  ? '#2B3B3E'
                  : '#B4D2CB'
                : COLORS.primary,
          },
        ]}
        onPress={handleStartSession}
        disabled={startingSession}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Start safety session button"
      >
        {startingSession ? (
          <ActivityIndicator color={COLORS.surface} />
        ) : (
          <Text style={styles.startButtonText}>Start safety session</Text>
        )}
      </TouchableOpacity>
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
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
  },
  durationButtonGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  durationButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  destinationInput: {
    height: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    marginTop: 8,
  },
  loadingMargin: {
    marginVertical: 14,
  },
  noContactsBox: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: COLORS.warningBg,
    alignItems: 'center',
  },
  noContactsText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  smallAddBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  smallAddBtnText: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkmark: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: '900',
  },
  contactDetails: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
  },
  contactEmail: {
    fontSize: 13,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  startButton: {
    height: 54,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
  },
  startButtonText: {
    color: COLORS.surface,
    fontSize: 17,
    fontWeight: '700',
  },
});

export default SessionSetupScreen;
