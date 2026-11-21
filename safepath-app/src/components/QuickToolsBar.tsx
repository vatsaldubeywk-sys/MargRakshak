import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { COLORS } from '../constants';

interface QuickToolsBarProps {
  onOpenSiren: () => void;
  onOpenFakeCall: () => void;
  onOpenHelpline: () => void;
  onShareQuickPin: () => void;
}

export const QuickToolsBar: React.FC<QuickToolsBarProps> = ({
  onOpenSiren,
  onOpenFakeCall,
  onOpenHelpline,
  onShareQuickPin,
}) => {
  const isDark = useColorScheme() === 'dark';

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: isDark ? '#E2F1EC' : COLORS.textPrimary }]}>
        🛠️ Emergency Toolkit
      </Text>

      <View style={styles.grid}>
        {/* Siren / Loud Alarm */}
        <TouchableOpacity
          style={[
            styles.toolCard,
            {
              backgroundColor: isDark ? '#2D1616' : '#FDF2F2',
              borderColor: isDark ? '#7F1D1D' : '#FCA5A5',
            },
          ]}
          onPress={onOpenSiren}
          activeOpacity={0.7}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Activate deterrent siren alarm"
        >
          <View style={[styles.iconCircle, { backgroundColor: '#EF4444' }]}>
            <Text style={styles.toolIcon}>📢</Text>
          </View>
          <Text style={[styles.toolTitle, { color: isDark ? '#FCA5A5' : '#991B1B' }]}>
            Siren Alarm
          </Text>
          <Text style={[styles.toolDesc, { color: isDark ? '#F87171' : '#B91C1C' }]}>
            Strobe & noise
          </Text>
        </TouchableOpacity>

        {/* Discreet Fake Call */}
        <TouchableOpacity
          style={[
            styles.toolCard,
            {
              backgroundColor: isDark ? '#142533' : '#F0F9FF',
              borderColor: isDark ? '#0369A1' : '#BAE6FD',
            },
          ]}
          onPress={onOpenFakeCall}
          activeOpacity={0.7}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Trigger simulated fake incoming phone call"
        >
          <View style={[styles.iconCircle, { backgroundColor: '#0284C7' }]}>
            <Text style={styles.toolIcon}>📱</Text>
          </View>
          <Text style={[styles.toolTitle, { color: isDark ? '#7DD3FC' : '#075985' }]}>
            Fake Call
          </Text>
          <Text style={[styles.toolDesc, { color: isDark ? '#38BDF8' : '#0369A1' }]}>
            Exit safely
          </Text>
        </TouchableOpacity>

        {/* India Helplines */}
        <TouchableOpacity
          style={[
            styles.toolCard,
            {
              backgroundColor: isDark ? '#221933' : '#FAF5FF',
              borderColor: isDark ? '#6B21A8' : '#E9D5FF',
            },
          ]}
          onPress={onOpenHelpline}
          activeOpacity={0.7}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Open official emergency helplines directory"
        >
          <View style={[styles.iconCircle, { backgroundColor: '#9333EA' }]}>
            <Text style={styles.toolIcon}>🇮🇳</Text>
          </View>
          <Text style={[styles.toolTitle, { color: isDark ? '#D8B4FE' : '#6B21A8' }]}>
            Helplines
          </Text>
          <Text style={[styles.toolDesc, { color: isDark ? '#C084FC' : '#7E22CE' }]}>
            112 · 1091 · 181
          </Text>
        </TouchableOpacity>

        {/* Instant Pin Share */}
        <TouchableOpacity
          style={[
            styles.toolCard,
            {
              backgroundColor: isDark ? '#122B22' : '#F0FDF4',
              borderColor: isDark ? '#166534' : '#BBF7D0',
            },
          ]}
          onPress={onShareQuickPin}
          activeOpacity={0.7}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Copy instant GPS location pin to clipboard"
        >
          <View style={[styles.iconCircle, { backgroundColor: '#16A34A' }]}>
            <Text style={styles.toolIcon}>📍</Text>
          </View>
          <Text style={[styles.toolTitle, { color: isDark ? '#86EFAC' : '#166534' }]}>
            Quick Pin
          </Text>
          <Text style={[styles.toolDesc, { color: isDark ? '#4ADE80' : '#15803D' }]}>
            Copy location
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  toolCard: {
    width: '48%',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  toolIcon: {
    fontSize: 20,
  },
  toolTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  toolDesc: {
    fontSize: 11,
    fontWeight: '500',
  },
});

export default QuickToolsBar;
