import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  useColorScheme,
  Switch,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, FamilyContact } from '../types';
import { COLORS } from '../constants';
import familyContactsService from '../services/familyContactsService';
import smsService from '../services/smsService';

type Props = NativeStackScreenProps<RootStackParamList, 'Contacts'>;

const RELATIONSHIP_OPTIONS = ['Parent', 'Mother', 'Father', 'Spouse', 'Sibling', 'Friend', 'Guardian', 'Other'];

export const ContactsScreen: React.FC<Props> = ({ navigation }) => {
  const isDark = useColorScheme() === 'dark';

  const [contacts, setContacts] = useState<FamilyContact[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [actionBusy, setActionBusy] = useState<boolean>(false);

  // Add Contact Modal State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [contactName, setContactName] = useState<string>('');
  const [contactPhone, setContactPhone] = useState<string>('');
  const [contactRelation, setContactRelation] = useState<string>('Family');

  // ─── Load Contacts from Offline Storage ──────────────────────────────
  const loadContacts = useCallback(async () => {
    try {
      const list = await familyContactsService.getContacts();
      setContacts(list);
    } catch (err) {
      console.warn('Failed to load contacts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const onRefresh = () => {
    setRefreshing(true);
    loadContacts();
  };

  // ─── Add Contact Handler ─────────────────────────────────────────────
  const handleAddContact = async () => {
    const trimmedName = contactName.trim();
    const trimmedPhone = contactPhone.replace(/[\s-]/g, '').trim();

    if (!trimmedName) {
      Alert.alert('Missing Name', 'Please enter a name for your family contact.');
      return;
    }

    if (!trimmedPhone || trimmedPhone.length < 8) {
      Alert.alert(
        'Invalid Phone Number',
        'Please enter a valid mobile number with country/area code (e.g. +91 9876543210).',
      );
      return;
    }

    try {
      setActionBusy(true);
      await familyContactsService.addContact(trimmedName, trimmedPhone, contactRelation);
      setContactName('');
      setContactPhone('');
      setContactRelation('Family');
      setShowAddModal(false);
      await loadContacts();
      Alert.alert(
        'Contact Added',
        `${trimmedName} will receive emergency alerts via SIM SMS when you need help.`,
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to save contact.');
    } finally {
      setActionBusy(false);
    }
  };

  // ─── Toggle Contact Selection ─────────────────────────────────────────
  const handleToggleContact = async (id: string) => {
    const updated = await familyContactsService.toggleContactSelection(id);
    setContacts(updated);
  };

  // ─── Delete Contact Handler ──────────────────────────────────────────
  const handleDeleteContact = (contact: FamilyContact) => {
    Alert.alert(
      'Remove Contact',
      `Are you sure you want to remove ${contact.name} from emergency SMS recipients?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const updated = await familyContactsService.deleteContact(contact.id);
            setContacts(updated);
          },
        },
      ],
    );
  };

  // ─── Send Test SMS via SIM Network ────────────────────────────────────
  const handleTestSms = async (contact: FamilyContact) => {
    Alert.alert(
      'Send Test SIM SMS',
      `Send a test SMS to ${contact.name} (${contact.phoneNumber}) to verify SIM network delivery?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Test SMS',
          onPress: async () => {
            try {
              setActionBusy(true);
              const testMsg = `🛡️ Marg Rakshak Test: This is a verification message. You are configured as an emergency contact for cellular SMS alerts.`;
              const success = await smsService.sendDirectSms(contact.phoneNumber, testMsg);
              if (success) {
                Alert.alert(
                  'Test SMS Sent',
                  `Test message successfully dispatched to ${contact.name} via SIM network.`,
                );
              } else {
                Alert.alert('Notice', 'SMS app opened for manual sending.');
              }
            } catch (err) {
              Alert.alert('Dispatch Error', 'Could not send test SMS over SIM network.');
            } finally {
              setActionBusy(false);
            }
          },
        },
      ],
    );
  };

  // ─── Render Contact Item ──────────────────────────────────────────────
  const renderItem = ({ item }: { item: FamilyContact }) => {
    return (
      <View
        style={[
          styles.contactCard,
          {
            backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
            borderColor: item.isSelected ? COLORS.primary : isDark ? '#374151' : '#E5E7EB',
          },
        ]}
      >
        <View style={styles.contactInfo}>
          <View style={styles.nameRow}>
            <Text
              style={[
                styles.contactName,
                { color: isDark ? '#F9FAFB' : '#111827' },
              ]}
            >
              {item.name}
            </Text>
            <View
              style={[
                styles.relationBadge,
                { backgroundColor: isDark ? '#374151' : '#F3F4F6' },
              ]}
            >
              <Text
                style={[
                  styles.relationText,
                  { color: isDark ? '#9CA3AF' : '#6B7280' },
                ]}
              >
                {item.relationship}
              </Text>
            </View>
          </View>

          <Text
            style={[
              styles.contactPhone,
              { color: isDark ? '#9CA3AF' : '#4B5563' },
            ]}
          >
            📱 {item.phoneNumber}
          </Text>

          <View style={styles.cardActionsRow}>
            <TouchableOpacity
              style={styles.testBtn}
              onPress={() => handleTestSms(item)}
              disabled={actionBusy}
            >
              <Text style={styles.testBtnText}>Send Test SMS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDeleteContact(item)}
              disabled={actionBusy}
            >
              <Text style={styles.deleteBtnText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Toggle switch for alert inclusion */}
        <View style={styles.switchContainer}>
          <Switch
            value={item.isSelected}
            onValueChange={() => handleToggleContact(item.id)}
            trackColor={{ false: '#D1D5DB', true: COLORS.primaryLight }}
            thumbColor={item.isSelected ? COLORS.primary : '#9CA3AF'}
          />
          <Text
            style={[
              styles.switchLabel,
              { color: item.isSelected ? COLORS.primary : '#9CA3AF' },
            ]}
          >
            {item.isSelected ? 'ACTIVE' : 'MUTED'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? '#111827' : '#F9FAFB' },
      ]}
    >
      {/* Header Banner */}
      <View
        style={[
          styles.banner,
          { backgroundColor: isDark ? '#1F2937' : '#E6F4F1' },
        ]}
      >
        <Text style={styles.bannerIcon}>📡</Text>
        <View style={styles.bannerTextContainer}>
          <Text
            style={[
              styles.bannerTitle,
              { color: isDark ? '#E2F1EC' : COLORS.primaryDark },
            ]}
          >
            SIM Network Emergency Contacts
          </Text>
          <Text
            style={[
              styles.bannerSubtitle,
              { color: isDark ? '#9CA3AF' : '#374151' },
            ]}
          >
            Active contacts receive offline cellular SMS alerts with your live GPS location
            if you stop moving or trigger SOS.
          </Text>
        </View>
      </View>

      {/* Contact List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text
            style={[
              styles.loadingText,
              { color: isDark ? '#9CA3AF' : '#6B7280' },
            ]}
          >
            Loading emergency contacts...
          </Text>
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>👨‍👩‍👧‍👦</Text>
              <Text
                style={[
                  styles.emptyTitle,
                  { color: isDark ? '#F9FAFB' : '#111827' },
                ]}
              >
                No Family Contacts Added
              </Text>
              <Text
                style={[
                  styles.emptySubtitle,
                  { color: isDark ? '#9CA3AF' : '#6B7280' },
                ]}
              >
                Add trusted family members (parents, spouse, siblings, friends) to receive
                automatic SMS alerts via SIM network when you are in danger.
              </Text>
            </View>
          }
        />
      )}

      {/* Floating Add Contact Button */}
      <View style={styles.footerContainer}>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: COLORS.primary }]}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonText}>+ Add Family Contact</Text>
        </TouchableOpacity>
      </View>

      {/* Add Contact Modal */}
      <Modal
        visible={showAddModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: isDark ? '#F9FAFB' : '#111827' },
              ]}
            >
              Add Family Contact
            </Text>
            <Text
              style={[
                styles.modalDesc,
                { color: isDark ? '#9CA3AF' : '#6B7280' },
              ]}
            >
              This person will receive direct SMS alerts with your GPS location via your phone SIM card.
            </Text>

            {/* Name Input */}
            <Text
              style={[
                styles.inputLabel,
                { color: isDark ? '#D1D5DB' : '#374151' },
              ]}
            >
              Full Name or Nickname
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: isDark ? '#374151' : '#F9FAFB',
                  color: isDark ? '#FFFFFF' : '#111827',
                  borderColor: isDark ? '#4B5563' : '#D1D5DB',
                },
              ]}
              placeholder="e.g. Mom, Dad, Sibling"
              placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'}
              value={contactName}
              onChangeText={setContactName}
            />

            {/* Phone Number Input */}
            <Text
              style={[
                styles.inputLabel,
                { color: isDark ? '#D1D5DB' : '#374151' },
              ]}
            >
              Mobile Phone Number
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: isDark ? '#374151' : '#F9FAFB',
                  color: isDark ? '#FFFFFF' : '#111827',
                  borderColor: isDark ? '#4B5563' : '#D1D5DB',
                },
              ]}
              placeholder="e.g. +91 98765 43210"
              placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'}
              keyboardType="phone-pad"
              value={contactPhone}
              onChangeText={setContactPhone}
            />

            {/* Relationship Chips */}
            <Text
              style={[
                styles.inputLabel,
                { color: isDark ? '#D1D5DB' : '#374151' },
              ]}
            >
              Relationship
            </Text>
            <View style={styles.chipsContainer}>
              {RELATIONSHIP_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.chip,
                    contactRelation === opt && styles.chipSelected,
                    {
                      backgroundColor:
                        contactRelation === opt
                          ? COLORS.primary
                          : isDark
                          ? '#374151'
                          : '#E5E7EB',
                    },
                  ]}
                  onPress={() => setContactRelation(opt)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      contactRelation === opt && styles.chipTextSelected,
                      { color: contactRelation === opt ? '#FFFFFF' : isDark ? '#D1D5DB' : '#374151' },
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Modal Action Buttons */}
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setShowAddModal(false)}
                disabled={actionBusy}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.saveBtn,
                  { backgroundColor: COLORS.primary },
                ]}
                onPress={handleAddContact}
                disabled={actionBusy}
              >
                {actionBusy ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Contact</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  banner: {
    flexDirection: 'row',
    padding: 16,
    margin: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  bannerIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  bannerTextContainer: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  contactCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 12,
    elevation: 1,
  },
  contactInfo: {
    flex: 1,
    marginRight: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  contactName: {
    fontSize: 17,
    fontWeight: '700',
    marginRight: 8,
  },
  relationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  relationText: {
    fontSize: 11,
    fontWeight: '600',
  },
  contactPhone: {
    fontSize: 14,
    marginBottom: 10,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  testBtn: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 10,
  },
  testBtnText: {
    color: '#3730A3',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  deleteBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  switchContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchLabel: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  footerContainer: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
  },
  addButton: {
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 54,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  textInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    marginBottom: 16,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: {},
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    fontWeight: '700',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    marginRight: 10,
    backgroundColor: '#E5E7EB',
  },
  cancelBtnText: {
    color: '#374151',
    fontWeight: '700',
  },
  saveBtn: {
    marginLeft: 10,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

export default ContactsScreen;
