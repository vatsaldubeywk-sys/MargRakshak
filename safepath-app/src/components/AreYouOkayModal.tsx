import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
  Animated,
  useColorScheme,
} from 'react-native';
import { COLORS } from '../constants';

interface AreYouOkayModalProps {
  visible: boolean;
  stationaryMinutes?: number;
  countdownSeconds?: number;
  onConfirmSafe: () => void;
  onTriggerImmediateSos: () => void;
  onTimeout: () => void;
}

export const AreYouOkayModal: React.FC<AreYouOkayModalProps> = ({
  visible,
  stationaryMinutes = 4,
  countdownSeconds = 60,
  onConfirmSafe,
  onTriggerImmediateSos,
  onTimeout,
}) => {
  const isDark = useColorScheme() === 'dark';
  const [secondsRemaining, setSecondsRemaining] = useState<number>(countdownSeconds);
  const pulseScale = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (visible) {
      setSecondsRemaining(countdownSeconds);

      // Warning vibration cadence (buzz, pause, buzz)
      Vibration.vibrate([0, 500, 250, 500, 250, 500], true);

      // Pulse animation for warning shield
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.15,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 1.0,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );
      pulseLoop.start();

      // Countdown timer
      timerRef.current = setInterval(() => {
        setSecondsRemaining(prev => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            Vibration.cancel();
            onTimeout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        Vibration.cancel();
        pulseLoop.stop();
      };
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      Vibration.cancel();
    }
  }, [visible, countdownSeconds, onTimeout, pulseScale]);

  const handleSafePress = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    Vibration.cancel();
    onConfirmSafe();
  };

  const handleHelpPress = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    Vibration.cancel();
    onTriggerImmediateSos();
  };

  const formatCountdown = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleSafePress}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            { backgroundColor: isDark ? '#1C1917' : '#FFFFFF' },
          ]}
        >
          {/* Pulsing Warning Icon */}
          <Animated.View
            style={[
              styles.iconWrapper,
              { transform: [{ scale: pulseScale }] },
            ]}
          >
            <Text style={styles.warningIcon}>⚠️</Text>
          </Animated.View>

          {/* Heading */}
          <Text
            style={[
              styles.title,
              { color: isDark ? '#FCA5A5' : '#DC2626' },
            ]}
          >
            ARE YOU OKAY?
          </Text>

          {/* Subtitle / Reason */}
          <Text
            style={[
              styles.description,
              { color: isDark ? '#D6D3D1' : '#4B5563' },
            ]}
          >
            You have stopped moving for over{' '}
            <Text style={styles.highlightText}>{stationaryMinutes} minutes</Text>.
            Please confirm your safety before emergency alerts are dispatched.
          </Text>

          {/* Countdown Clock */}
          <View style={styles.timerContainer}>
            <Text style={styles.timerLabel}>Auto-escalation to family in:</Text>
            <Text
              style={[
                styles.timerDigits,
                { color: secondsRemaining <= 15 ? '#EF4444' : '#F59E0B' },
              ]}
            >
              {formatCountdown(secondsRemaining)}
            </Text>
          </View>

          {/* Primary Action: Confirm Safe */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.safeBtn]}
            onPress={handleSafePress}
            activeOpacity={0.8}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="I am okay, cancel emergency alert"
          >
            <Text style={styles.safeBtnText}>✓ I AM OKAY (Cancel Alert)</Text>
          </TouchableOpacity>

          {/* Emergency Override: Request Immediate Help */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.dangerBtn]}
            onPress={handleHelpPress}
            activeOpacity={0.8}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="I need help now, dispatch emergency SMS"
          >
            <Text style={styles.dangerBtnText}>🚨 I NEED HELP NOW</Text>
          </TouchableOpacity>

          {/* Context Footer */}
          <Text
            style={[
              styles.footerNotice,
              { color: isDark ? '#78716C' : '#9CA3AF' },
            ]}
          >
            If you do not respond, an urgent SMS with your GPS location will be sent
            directly via SIM network to your selected family contacts.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#DC2626',
    elevation: 8,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#F87171',
  },
  warningIcon: {
    fontSize: 42,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  highlightText: {
    fontWeight: '700',
    color: '#EF4444',
  },
  timerContainer: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  timerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  timerDigits: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  actionBtn: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  safeBtn: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  safeBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dangerBtn: {
    backgroundColor: '#EF4444',
  },
  dangerBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footerNotice: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
  },
});
