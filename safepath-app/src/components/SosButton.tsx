import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
  Platform,
  useColorScheme,
} from 'react-native';
import { COLORS } from '../constants';

interface SosButtonProps {
  onActivate: () => void;
  disabled?: boolean;
}

const HOLD_DURATION_MS = 2500;

export const SosButton: React.FC<SosButtonProps> = ({
  onActivate,
  disabled = false,
}) => {
  const isDark = useColorScheme() === 'dark';
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [isHolding, setIsHolding] = useState<boolean>(false);

  const handlePressIn = () => {
    if (disabled) return;

    setIsHolding(true);
    progressAnim.setValue(0);

    // Animate progress over 2.5 seconds
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: HOLD_DURATION_MS,
      useNativeDriver: false, // width animation requires JS driver
    }).start();

    // Trigger timer after 2.5 seconds
    timerRef.current = setTimeout(() => {
      // Vibrate on activation: pattern for emphasis (400ms on, 200ms off, 400ms on) or single strong pulse
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 400, 200, 400]);
      } else {
        Vibration.vibrate();
      }
      setIsHolding(false);
      progressAnim.setValue(0);
      onActivate();
    }, HOLD_DURATION_MS);
  };

  const handlePressOut = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
    setIsHolding(false);
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="SOS Emergency Assistance"
        accessibilityHint="Press and hold continuously for 2.5 seconds to trigger emergency SOS alert to your trusted contacts"
        style={[
          styles.button,
          {
            backgroundColor: disabled
              ? (isDark ? '#3E2727' : '#E8B5B5')
              : COLORS.danger,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.progressBar,
            {
              width: progressWidth,
              backgroundColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0, 0, 0, 0.25)',
            },
          ]}
        />
        <View style={styles.textContainer}>
          <Text style={styles.buttonText}>
            {isHolding ? 'Holding... Keep pressed' : 'SOS · Hold 2.5s · I need help'}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginVertical: 12,
  },
  button: {
    height: 58,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.27,
    shadowRadius: 4.65,
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 16,
  },
  textContainer: {
    zIndex: 1,
    paddingHorizontal: 16,
  },
  buttonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});

export default SosButton;
