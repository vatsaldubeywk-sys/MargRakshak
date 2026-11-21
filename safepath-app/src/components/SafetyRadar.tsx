import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  useColorScheme,
} from 'react-native';
import { COLORS } from '../constants';

interface SafetyRadarProps {
  sessionActive: boolean;
  nextCheckInAt: string | null;
  sessionExpiresAt: string | null;
  gpsAccuracy?: number;
  contactCount: number;
  onQuickCheckIn: () => void;
  onExtendSession: () => void;
  checkInBusy?: boolean;
}

export const SafetyRadar: React.FC<SafetyRadarProps> = ({
  sessionActive,
  nextCheckInAt,
  sessionExpiresAt,
  gpsAccuracy,
  contactCount,
  onQuickCheckIn,
  onExtendSession,
  checkInBusy = false,
}) => {
  const isDark = useColorScheme() === 'dark';

  // Animation values
  const pulseAnim1 = useRef(new Animated.Value(1)).current;
  const pulseAnim2 = useRef(new Animated.Value(1)).current;
  const radarRotate = useRef(new Animated.Value(0)).current;

  // Pulse ring animation
  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim1, {
            toValue: 1.45,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim1, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulseAnim2, {
            toValue: 1.25,
            duration: 1600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim2, {
            toValue: 1,
            duration: 1600,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    pulseLoop.start();

    // Radar rotation animation when session active
    const rotateLoop = Animated.loop(
      Animated.timing(radarRotate, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      }),
    );
    if (sessionActive) {
      rotateLoop.start();
    } else {
      rotateLoop.stop();
      radarRotate.setValue(0);
    }

    return () => {
      pulseLoop.stop();
      rotateLoop.stop();
    };
  }, [pulseAnim1, pulseAnim2, radarRotate, sessionActive]);

  const spin = radarRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const formatRemainingMinutes = (isoString: string | null): string => {
    if (!isoString) return '--';
    const ms = new Date(isoString).getTime() - Date.now();
    if (ms <= 0) return 'Due now';
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? '#141E21' : '#FFFFFF',
          borderColor: isDark ? '#26373B' : COLORS.border,
        },
      ]}
    >
      {/* Visual Animated Radar Area */}
      <View style={styles.radarCenterArea}>
        {/* Outer Pulse Wave 1 */}
        <Animated.View
          style={[
            styles.pulseRing,
            styles.pulseRingOuter,
            {
              transform: [{ scale: pulseAnim1 }],
              borderColor: sessionActive ? '#10B98130' : '#147D6820',
            },
          ]}
        />

        {/* Pulse Wave 2 */}
        <Animated.View
          style={[
            styles.pulseRing,
            styles.pulseRingInner,
            {
              transform: [{ scale: pulseAnim2 }],
              borderColor: sessionActive ? '#10B98160' : '#147D6840',
            },
          ]}
        />

        {/* Active Radar Sweep */}
        {sessionActive && (
          <Animated.View style={[styles.radarSweep, { transform: [{ rotate: spin }] }]} />
        )}

        {/* Core Center Shield */}
        <View
          style={[
            styles.coreShield,
            {
              backgroundColor: sessionActive ? '#059669' : '#147D68',
              shadowColor: sessionActive ? '#10B981' : '#147D68',
            },
          ]}
        >
          <Text style={styles.coreShieldIcon}>{sessionActive ? '📡' : '🛡️'}</Text>
        </View>
      </View>

      {/* Status Headline */}
      <Text style={[styles.title, { color: isDark ? '#E2F1EC' : COLORS.textPrimary }]}>
        {sessionActive ? 'Live Journey Tracking Active' : 'Marg Rakshak Guard Ready'}
      </Text>
      <Text style={[styles.subtitle, { color: isDark ? '#98ABB0' : COLORS.textSecondary }]}>
        {sessionActive
          ? `Check-in deadline: ${formatRemainingMinutes(nextCheckInAt)}`
          : 'Start a session anytime to stream location with trusted responders'}
      </Text>

      {/* Live Telemetry Chips */}
      <View style={styles.chipsRow}>
        <View style={[styles.chip, { backgroundColor: isDark ? '#1A292C' : '#EAF2F0' }]}>
          <Text style={styles.chipText}>
            🛰️ {gpsAccuracy ? `±${Math.round(gpsAccuracy)}m GPS` : 'GPS Standby'}
          </Text>
        </View>

        <View style={[styles.chip, { backgroundColor: isDark ? '#1A292C' : '#EAF2F0' }]}>
          <Text style={styles.chipText}>
            👥 {contactCount} Contact{contactCount !== 1 ? 's' : ''} Ready
          </Text>
        </View>

        <View style={[styles.chip, { backgroundColor: isDark ? '#1A292C' : '#EAF2F0' }]}>
          <Text style={styles.chipText}>
            🔋 Battery Synced
          </Text>
        </View>
      </View>

      {/* Interactive In-Session Quick Actions */}
      {sessionActive && (
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={[styles.quickCheckInBtn, checkInBusy && styles.btnDisabled]}
            onPress={onQuickCheckIn}
            disabled={checkInBusy}
            activeOpacity={0.75}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Check in as safe"
          >
            <Text style={styles.quickCheckInText}>
              {checkInBusy ? 'Saving...' : '✓ I Am Safe · Check In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickExtendBtn}
            onPress={onExtendSession}
            activeOpacity={0.75}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Extend safety session by 15 minutes"
          >
            <Text style={styles.quickExtendText}>+15m</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1.5,
    marginVertical: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  radarCenterArea: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 12,
  },
  pulseRing: {
    position: 'absolute',
    borderRadius: 100,
    borderWidth: 2,
  },
  pulseRingOuter: {
    width: 130,
    height: 130,
  },
  pulseRingInner: {
    width: 95,
    height: 95,
  },
  radarSweep: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderTopWidth: 3,
    borderTopColor: '#34D399',
    borderRightWidth: 3,
    borderRightColor: 'transparent',
    borderBottomWidth: 0,
    borderLeftWidth: 0,
  },
  coreShield: {
    width: 66,
    height: 66,
    borderRadius: 33,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  coreShieldIcon: {
    fontSize: 30,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 18,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#147D68',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 18,
    paddingHorizontal: 4,
  },
  quickCheckInBtn: {
    flex: 1,
    height: 48,
    backgroundColor: '#059669',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  quickCheckInText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  quickExtendBtn: {
    width: 62,
    height: 48,
    backgroundColor: '#E2F1EC',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#147D6840',
  },
  quickExtendText: {
    color: '#126B5A',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default SafetyRadar;
