import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
  Platform,
  StatusBar,
  Animated,
} from 'react-native';
import { COLORS } from '../constants';

interface FakeCallModalProps {
  visible: boolean;
  onClose: () => void;
  callerName?: string;
}

export const FakeCallModal: React.FC<FakeCallModalProps> = ({
  visible,
  onClose,
  callerName = 'Mom',
}) => {
  const [callState, setCallState] = useState<'incoming' | 'connected'>('incoming');
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeaker, setIsSpeaker] = useState<boolean>(false);

  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for incoming call icon
  useEffect(() => {
    if (visible && callState === 'incoming') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();

      // Trigger realistic vibration pattern
      Vibration.vibrate([0, 1000, 1000], true);

      return () => {
        pulse.stop();
        Vibration.cancel();
      };
    }
  }, [visible, callState, pulseAnim]);

  // Duration timer when connected
  useEffect(() => {
    if (callState === 'connected') {
      durationTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

      return () => {
        if (durationTimerRef.current) {
          clearInterval(durationTimerRef.current);
          durationTimerRef.current = null;
        }
      };
    }
  }, [callState]);

  // Reset state on close
  useEffect(() => {
    if (!visible) {
      setCallState('incoming');
      setCallDuration(0);
      setIsMuted(false);
      setIsSpeaker(false);
      Vibration.cancel();
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    }
  }, [visible]);

  const handleAccept = () => {
    Vibration.cancel();
    Vibration.vibrate(80);
    setCallState('connected');
  };

  const handleDeclineOrEnd = () => {
    Vibration.cancel();
    Vibration.vibrate(100);
    onClose();
  };

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleDeclineOrEnd}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0D1117" />
      <View style={styles.container}>
        {/* Caller Header Info */}
        <View style={styles.topSection}>
          <Animated.View style={[styles.avatarCircle, { transform: [{ scale: pulseAnim }] }]}>
            <Text style={styles.avatarInitial}>{callerName.charAt(0).toUpperCase()}</Text>
          </Animated.View>
          <Text style={styles.callerTitle}>{callerName}</Text>
          <Text style={styles.callSubtitle}>
            {callState === 'incoming' ? 'Incoming Mobile Call...' : formatDuration(callDuration)}
          </Text>
        </View>

        {/* In-Call Controls (visible when connected) */}
        {callState === 'connected' ? (
          <View style={styles.connectedControls}>
            <View style={styles.controlsRow}>
              <TouchableOpacity
                style={[styles.controlButton, isMuted && styles.controlButtonActive]}
                onPress={() => setIsMuted(!isMuted)}
              >
                <Text style={styles.controlIcon}>{isMuted ? '🔇' : '🎙️'}</Text>
                <Text style={styles.controlLabel}>{isMuted ? 'Muted' : 'Mute'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.controlButton}>
                <Text style={styles.controlIcon}>⌨️</Text>
                <Text style={styles.controlLabel}>Keypad</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.controlButton, isSpeaker && styles.controlButtonActive]}
                onPress={() => setIsSpeaker(!isSpeaker)}
              >
                <Text style={styles.controlIcon}>🔊</Text>
                <Text style={styles.controlLabel}>{isSpeaker ? 'Speaker On' : 'Speaker'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.controlsRow}>
              <TouchableOpacity style={styles.controlButton}>
                <Text style={styles.controlIcon}>➕</Text>
                <Text style={styles.controlLabel}>Add Call</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.controlButton}>
                <Text style={styles.controlIcon}>📹</Text>
                <Text style={styles.controlLabel}>Video</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.controlButton}>
                <Text style={styles.controlIcon}>👤</Text>
                <Text style={styles.controlLabel}>Contacts</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.incomingPlaceholder} />
        )}

        {/* Bottom Actions */}
        <View style={styles.bottomSection}>
          {callState === 'incoming' ? (
            <View style={styles.incomingButtonsRow}>
              {/* Decline */}
              <TouchableOpacity
                style={[styles.actionButton, styles.declineButton]}
                onPress={handleDeclineOrEnd}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Decline Call"
              >
                <Text style={styles.actionIcon}>✕</Text>
                <Text style={styles.actionLabel}>Decline</Text>
              </TouchableOpacity>

              {/* Accept */}
              <TouchableOpacity
                style={[styles.actionButton, styles.acceptButton]}
                onPress={handleAccept}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Accept Call"
              >
                <Text style={styles.actionIcon}>✓</Text>
                <Text style={styles.actionLabel}>Accept</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.endCallContainer}>
              <TouchableOpacity
                style={[styles.actionButton, styles.declineButton, styles.endButtonWide]}
                onPress={handleDeclineOrEnd}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="End Call"
              >
                <Text style={styles.actionIcon}>✕</Text>
                <Text style={styles.actionLabel}>End Call</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F14',
    paddingHorizontal: 24,
    paddingVertical: 48,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
    marginTop: 36,
  },
  avatarCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    elevation: 8,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  avatarInitial: {
    color: '#F8FAFC',
    fontSize: 46,
    fontWeight: '700',
  },
  callerTitle: {
    color: '#F8FAFC',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  callSubtitle: {
    color: '#94A3B8',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  incomingPlaceholder: {
    flex: 1,
  },
  connectedControls: {
    marginVertical: 24,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#1E293B80',
    borderWidth: 1,
    borderColor: '#334155',
  },
  controlButtonActive: {
    backgroundColor: '#38BDF8',
  },
  controlIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  controlLabel: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '500',
  },
  bottomSection: {
    marginBottom: 32,
  },
  incomingButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  actionButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  declineButton: {
    backgroundColor: '#EF4444',
  },
  acceptButton: {
    backgroundColor: '#22C55E',
  },
  endButtonWide: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  endCallContainer: {
    alignItems: 'center',
  },
  actionIcon: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});

export default FakeCallModal;
