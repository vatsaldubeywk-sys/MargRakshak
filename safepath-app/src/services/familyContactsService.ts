import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import type { FamilyContact } from '../types';

const FAMILY_CONTACTS_KEY = '@margrakshak_family_contacts';

/**
 * Offline-first Family Contacts service for Marg Rakshak.
 * Manages phone numbers for SIM-based cellular SMS alerts.
 * Operates without requiring internet or cloud authentication.
 */
class FamilyContactsService {
  /**
   * Retrieves all saved family contacts from local device storage.
   */
  async getContacts(): Promise<FamilyContact[]> {
    try {
      const json = await AsyncStorage.getItem(FAMILY_CONTACTS_KEY);
      if (!json) {
        return [];
      }
      return JSON.parse(json) as FamilyContact[];
    } catch (err) {
      console.warn('Failed to load family contacts:', err);
      return [];
    }
  }

  /**
   * Retrieves only contacts that have been selected/toggled for alert broadcasts.
   */
  async getSelectedContacts(): Promise<FamilyContact[]> {
    const all = await this.getContacts();
    return all.filter(c => c.isSelected);
  }

  /**
   * Adds a new family contact with phone number.
   */
  async addContact(
    name: string,
    phoneNumber: string,
    relationship: string = 'Family',
  ): Promise<FamilyContact> {
    const all = await this.getContacts();

    // Clean phone number: remove spaces and hyphens
    const cleanPhone = phoneNumber.replace(/[\s-]/g, '').trim();

    const newContact: FamilyContact = {
      id: uuidv4(),
      name: name.trim(),
      phoneNumber: cleanPhone,
      relationship: relationship.trim() || 'Family',
      isSelected: true, // Default to selected so they receive alerts
      createdAt: Date.now(),
    };

    const updated = [newContact, ...all];
    await AsyncStorage.setItem(FAMILY_CONTACTS_KEY, JSON.stringify(updated));
    return newContact;
  }

  /**
   * Toggles the alert reception status of a contact.
   */
  async toggleContactSelection(id: string): Promise<FamilyContact[]> {
    const all = await this.getContacts();
    const updated = all.map(c =>
      c.id === id ? { ...c, isSelected: !c.isSelected } : c,
    );
    await AsyncStorage.setItem(FAMILY_CONTACTS_KEY, JSON.stringify(updated));
    return updated;
  }

  /**
   * Updates an existing contact's details.
   */
  async updateContact(contact: FamilyContact): Promise<FamilyContact[]> {
    const all = await this.getContacts();
    const cleanPhone = contact.phoneNumber.replace(/[\s-]/g, '').trim();
    const updated = all.map(c =>
      c.id === contact.id ? { ...contact, phoneNumber: cleanPhone } : c,
    );
    await AsyncStorage.setItem(FAMILY_CONTACTS_KEY, JSON.stringify(updated));
    return updated;
  }

  /**
   * Removes a contact from local storage.
   */
  async deleteContact(id: string): Promise<FamilyContact[]> {
    const all = await this.getContacts();
    const updated = all.filter(c => c.id !== id);
    await AsyncStorage.setItem(FAMILY_CONTACTS_KEY, JSON.stringify(updated));
    return updated;
  }
}

export default new FamilyContactsService();
