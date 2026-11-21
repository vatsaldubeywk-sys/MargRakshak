import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { COLORS } from '../constants';

export interface PresetItem {
  id: string;
  icon: string;
  title: string;
  durationMinutes: number;
  destination: string;
  badge: string;
}

const PRESETS: PresetItem[] = [
  {
    id: 'walk',
    icon: '🚶‍♀️',
    title: 'Night Walk',
    durationMinutes: 30,
    destination: 'Home',
    badge: '30 MIN',
  },
  {
    id: 'cab',
    icon: '🚕',
    title: 'Cab / Auto',
    durationMinutes: 45,
    destination: 'Ride-Share Transit',
    badge: '45 MIN',
  },
  {
    id: 'run',
    icon: '🏃',
    title: 'Solo Run',
    durationMinutes: 60,
    destination: 'Outdoor Jog / Workout',
    badge: '60 MIN',
  },
  {
    id: 'metro',
    icon: '🚇',
    title: 'Transit',
    durationMinutes: 45,
    destination: 'Metro / Bus Journey',
    badge: '45 MIN',
  },
];

interface JourneyPresetsProps {
  onSelectPreset: (preset: PresetItem) => void;
  disabled?: boolean;
}

export const JourneyPresets: React.FC<JourneyPresetsProps> = ({
  onSelectPreset,
  disabled = false,
}) => {
  const isDark = useColorScheme() === 'dark';

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: isDark ? '#E2F1EC' : COLORS.textPrimary }]}>
          ⚡ Quick Safety Presets
        </Text>
        <Text style={[styles.sectionSubtitle, { color: isDark ? '#98ABB0' : COLORS.textSecondary }]}>
          One-tap configured journeys
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {PRESETS.map(preset => (
          <TouchableOpacity
            key={preset.id}
            style={[
              styles.presetCard,
              {
                backgroundColor: isDark ? '#192427' : '#FFFFFF',
                borderColor: isDark ? '#26373B' : COLORS.border,
                opacity: disabled ? 0.6 : 1,
              },
            ]}
            onPress={() => !disabled && onSelectPreset(preset)}
            activeOpacity={0.7}
            disabled={disabled}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`Start preset ${preset.title} for ${preset.durationMinutes} minutes`}
          >
            <View style={styles.presetTopRow}>
              <Text style={styles.presetIcon}>{preset.icon}</Text>
              <View style={styles.presetBadge}>
                <Text style={styles.presetBadgeText}>{preset.badge}</Text>
              </View>
            </View>

            <Text style={[styles.presetTitle, { color: isDark ? '#E2F1EC' : COLORS.textPrimary }]}>
              {preset.title}
            </Text>
            <Text style={[styles.presetDest, { color: isDark ? '#98ABB0' : COLORS.textSecondary }]}>
              {preset.destination}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  scrollContent: {
    gap: 12,
    paddingRight: 8,
  },
  presetCard: {
    width: 140,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  presetTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  presetIcon: {
    fontSize: 26,
  },
  presetBadge: {
    backgroundColor: '#E2F1EC',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  presetBadgeText: {
    color: '#126B5A',
    fontSize: 10,
    fontWeight: '800',
  },
  presetTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  presetDest: {
    fontSize: 11,
    lineHeight: 14,
  },
});

export default JourneyPresets;
