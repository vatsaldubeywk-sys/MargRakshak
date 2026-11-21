import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
  Linking,
  StatusBar,
  Animated,
} from 'react-native';
import { COLORS } from '../constants';

interface SirenModalProps {
  visible: boolean;
  onClose: () => void;
}

export const SirenModal: React.FC<SirenModalProps> = ({ visible, onClose }) => {
  const [strobeColorIndex, setStrobeColorIndex] = useState<number>(0);
  const strobeColors = ['#DC2626', '#EAB308', '#FFFFFF', '#DC2626', '#1E1E1E'];

  const flashIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      // Rapid visual strobe every 120ms
      flashIntervalRef.current = setInterval(() => {
        setStrobeColorIndex(prev => (prev + 1) % strobeColors.length);
      }, 120);

      // Aggressive repeating deterrent vibration
      Vibration.vibrate([0, 200, 100, 200, 100, 400], true);

      // Pulse animation for warning shield
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.15,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();

      return () => {
        if (flashIntervalRef.current) {
          clearInterval(flashIntervalRef.current);
          flashIntervalRef.current = null;
        }
        Vibration.cancel();
        pulse.stop();
      };
    }
  }, [visible, pulseScale]);

  const handleStopSiren = () => {
    Vibration.cancel();
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current);
    }
    onClose();
  };

  const handleCallEmergency = () => {
    Linking.openURL('tel:112');
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={handleStopSiren}
    >
      <StatusBar barStyle="light-content" backgroundColor="#DC2626" />
      <View style={[styles.container, { backgroundColor: strobeColors[strobeColorIndex] }]}>
        {/* Urgent Warning Header */}
        <View style={styles.topBanner}>
          <Text style={styles.bannerText}>⚠️ EMERGENCY DETERRENT SIREN ACTIVE</Text>
        </View>

        {/* Center Pulsing Warning Icon */}
        <View style={styles.centerSection}>
          <Animated.View style={[styles.shieldIconCircle, { transform: [{ scale: pulseScale }] }]}>
            <Text style={styles.shieldEmoji}>📢</Text>
          </Animated.View>
          <Text style={styles.warningTitle}>ALARM BLARING</Text>
          <Text style={styles.warningSubtitle}>
            High-contrast visual strobe and tactical vibrations are active to deter threats.
          </Text>
        </View>

        {/* Bottom Actions */}
        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={styles.call112Button}
            onPress={handleCallEmergency}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Call Police and Ambulance 112 Now"
          >
            <Text style={styles.call112Icon}>🚨</Text>
            <Text style={styles.call112Text}>CALL 112 NOW</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.stopButton}
            onPress={handleStopSiren}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Turn off deterrent siren"
          >
            <Text style={styles.stopButtonText}>STOP SIREN</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  topBanner: {
    backgroundColor: '#000000',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  bannerText: {
    color: '#FEF08A',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  centerSection: {
    alignItems: 'center',
    backgroundColor: '#000000E6',
    padding: 28,
    borderRadius: 24,
    marginVertical: 'auto',
  },
  shieldIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  shieldEmoji: {
    fontSize: 50,
  },
  warningTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 8,
  },
  warningSubtitle: {
    color: '#D1D5DB',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomSection: {
    gap: 14,
    marginBottom: 20,
  },
  call112Button: {
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  call112Icon: {
    fontSize: 24,
    marginRight: 10,
  },
  call112Text: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },
  stopButton: {
    backgroundColor: '#1E293B',
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569',
  },
  stopButtonText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default SirenModal;
