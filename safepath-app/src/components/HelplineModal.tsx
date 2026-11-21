import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ScrollView,
  useColorScheme,
  Alert,
} from 'react-native';
import { COLORS } from '../constants';

interface HelplineModalProps {
  visible: boolean;
  onClose: () => void;
}

interface HelplineItem {
  number: string;
  title: string;
  description: string;
  badge: string;
  color: string;
}

const HELPLINES: HelplineItem[] = [
  {
    number: '112',
    title: 'National Emergency Helpline (ERSS)',
    description: 'Unified 24x7 police, medical ambulance, and fire rescue across all India.',
    badge: 'PRIORITY',
    color: '#DC2626',
  },
  {
    number: '1091',
    title: 'Women Helpline',
    description: 'Dedicated national helpline for women safety, distress, and immediate police response.',
    badge: 'WOMEN SAFETY',
    color: '#9333EA',
  },
  {
    number: '181',
    title: 'Women in Distress Helpline',
    description: 'Support, counselling, and emergency rescue for domestic abuse and harassment.',
    badge: 'TOLL-FREE',
    color: '#E11D48',
  },
  {
    number: '1098',
    title: 'Childline Emergency',
    description: '24-hour emergency phone outreach service for children in need of aid and protection.',
    badge: 'CHILD AID',
    color: '#2563EB',
  },
  {
    number: '139',
    title: 'Indian Railways Security',
    description: 'Passenger safety, medical emergency, and security on trains and railway stations.',
    badge: 'TRANSIT',
    color: '#0D9488',
  },
];

export const HelplineModal: React.FC<HelplineModalProps> = ({ visible, onClose }) => {
  const isDark = useColorScheme() === 'dark';

  const handleDial = (number: string, title: string) => {
    Alert.alert(
      `Call ${title}?`,
      `Your phone will open the dialer for ${number}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Call ${number}`,
          onPress: () => {
            Linking.openURL(`tel:${number}`).catch(() => {
              Alert.alert('Error', `Could not open dialer for ${number}.`);
            });
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheetContainer,
            { backgroundColor: isDark ? '#141E21' : COLORS.surface },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.headerTitle, { color: isDark ? '#E2F1EC' : COLORS.textPrimary }]}>
                🇮🇳 Emergency Helplines
              </Text>
              <Text style={[styles.headerSubtitle, { color: isDark ? '#98ABB0' : COLORS.textSecondary }]}>
                Tap any official India service for instant connection
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeCircle}
              onPress={onClose}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Close Emergency Helplines"
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* List of Helplines */}
          <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {HELPLINES.map(item => (
              <TouchableOpacity
                key={item.number}
                style={[
                  styles.card,
                  {
                    backgroundColor: isDark ? '#192427' : '#FFFFFF',
                    borderColor: isDark ? '#26373B' : COLORS.border,
                  },
                ]}
                onPress={() => handleDial(item.number, item.title)}
                activeOpacity={0.7}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`Call ${item.title} at ${item.number}`}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.numberBadge, { backgroundColor: item.color }]}>
                    <Text style={styles.numberBadgeText}>📞 {item.number}</Text>
                  </View>
                  <Text style={[styles.categoryBadge, { color: item.color }]}>{item.badge}</Text>
                </View>

                <Text style={[styles.cardTitle, { color: isDark ? '#E2F1EC' : COLORS.textPrimary }]}>
                  {item.title}
                </Text>
                <Text style={[styles.cardDesc, { color: isDark ? '#98ABB0' : COLORS.textSecondary }]}>
                  {item.description}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    maxHeight: '82%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2EAE840',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  closeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E2EAE860',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 16,
    color: '#647780',
    fontWeight: '700',
  },
  listContent: {
    gap: 12,
    paddingBottom: 16,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  numberBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  numberBadgeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  categoryBadge: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
});

export default HelplineModal;
