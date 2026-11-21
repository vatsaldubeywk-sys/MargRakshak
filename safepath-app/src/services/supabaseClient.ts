import {createClient} from '@supabase/supabase-js';
import EncryptedStorage from 'react-native-encrypted-storage';
import {SUPABASE_URL, SUPABASE_ANON_KEY} from '../constants';

/**
 * Custom storage adapter backed by react-native-encrypted-storage.
 * Keeps Supabase auth tokens (access + refresh) in the device keychain / keystore
 * rather than plain AsyncStorage.
 */
const EncryptedStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const value = await EncryptedStorage.getItem(key);
      return value ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await EncryptedStorage.setItem(key, value);
    } catch (e) {
      console.warn('EncryptedStorage setItem error:', e);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await EncryptedStorage.removeItem(key);
    } catch (e) {
      console.warn('EncryptedStorage removeItem error:', e);
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: EncryptedStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // not applicable in React Native
  },
});
