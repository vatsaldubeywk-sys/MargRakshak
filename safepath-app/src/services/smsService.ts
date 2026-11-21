import {
  NativeModules,
  Platform,
  PermissionsAndroid,
  Linking,
  Alert,
} from 'react-native';
import type { FamilyContact } from '../types';

const { DirectSmsModule } = NativeModules;

export interface SmsDispatchResult {
  sentCount: number;
  failedCount: number;
  totalAttempted: number;
  usedFallback: boolean;
}

class SmsService {
  /**
   * Request SEND_SMS runtime permission on Android.
   */
  async requestSmsPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.SEND_SMS,
        {
          title: 'Marg Rakshak SIM SMS Permission',
          message:
            'Marg Rakshak sends emergency SOS and stationary alerts directly to your family members via SIM cellular network when internet is unavailable.',
          buttonPositive: 'Allow SIM SMS',
          buttonNegative: 'Deny',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('Failed to request SEND_SMS permission:', err);
      return false;
    }
  }

  /**
   * Dispatches direct SIM SMS to a single phone number.
   * Uses native DirectSmsModule on Android if available and permitted;
   * otherwise opens device SMS dialer/composer.
   */
  async sendDirectSms(phoneNumber: string, message: string): Promise<boolean> {
    const cleanPhone = phoneNumber.replace(/[\s-]/g, '').trim();
    if (!cleanPhone) return false;

    if (Platform.OS === 'android' && DirectSmsModule?.sendDirectSms) {
      try {
        const hasPermission = await this.requestSmsPermission();
        if (hasPermission) {
          await DirectSmsModule.sendDirectSms(cleanPhone, message);
          return true;
        }
      } catch (err) {
        console.warn('DirectSmsModule dispatch failed, using Intent fallback:', err);
      }
    }

    // Fallback: Launch native SMS application with pre-filled content
    try {
      const separator = Platform.OS === 'ios' ? '&' : '?';
      const url = `sms:${cleanPhone}${separator}body=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return true;
      }
    } catch (fallbackErr) {
      console.warn('SMS intent fallback failed:', fallbackErr);
    }

    return false;
  }

  /**
   * Sends an emergency SMS to all selected family contacts via SIM cellular network.
   */
  async sendEmergencySmsToFamily(
    contacts: FamilyContact[],
    message: string,
  ): Promise<SmsDispatchResult> {
    const selected = contacts.filter(c => c.isSelected && c.phoneNumber);
    if (selected.length === 0) {
      return { sentCount: 0, failedCount: 0, totalAttempted: 0, usedFallback: false };
    }

    const phoneNumbers = selected.map(c => c.phoneNumber.replace(/[\s-]/g, '').trim());

    // Primary: Native direct SIM dispatch without UI interruption (Android)
    if (Platform.OS === 'android' && DirectSmsModule?.sendSmsToMultiple) {
      try {
        const hasPermission = await this.requestSmsPermission();
        if (hasPermission) {
          const res = await DirectSmsModule.sendSmsToMultiple(phoneNumbers, message);
          return {
            sentCount: res.sentCount,
            failedCount: res.failedCount,
            totalAttempted: phoneNumbers.length,
            usedFallback: false,
          };
        }
      } catch (err) {
        console.warn('Native batch direct SMS failed, falling back to sequential/intent:', err);
      }
    }

    // Fallback: Dispatch using system SMS composer
    let sentCount = 0;
    try {
      const separator = Platform.OS === 'ios' ? '&' : '?';
      const phoneList = phoneNumbers.join(Platform.OS === 'ios' ? ',' : ';');
      const url = `sms:${phoneList}${separator}body=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        sentCount = phoneNumbers.length;
      }
    } catch {
      sentCount = 0;
    }

    return {
      sentCount,
      failedCount: phoneNumbers.length - sentCount,
      totalAttempted: phoneNumbers.length,
      usedFallback: true,
    };
  }

  // ─── Emergency Message Templates ─────────────────────────────────────

  /**
   * Message sent when user stops moving and fails to respond to "Are You Okay?" prompt.
   * Instructs family to call user, and empowers family to decide when to call 112 / 108.
   */
  formatInactivityEmergencySms(
    userName: string,
    latitude: number,
    longitude: number,
    accuracyM: number,
    stationaryMinutes: number = 4,
  ): string {
    const name = userName ? userName : 'Your family member';
    const lat = latitude.toFixed(6);
    const lon = longitude.toFixed(6);
    const mapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;

    return `⚠️ MARG RAKSHAK INACTIVITY ALERT!\n\n${name} has stopped moving for over ${stationaryMinutes} minutes and did NOT respond to the safety check prompt.\n\n📍 Last GPS: ${lat}, ${lon} (±${Math.round(accuracyM)}m)\n🗺️ Live Map: ${mapUrl}\n\nPlease CALL them immediately! If they do not answer or you suspect danger, please contact Police (112) or Ambulance (108) on their behalf.`;
  }

  /**
   * Message sent when user presses the SOS button.
   */
  formatSosEmergencySms(
    userName: string,
    latitude: number,
    longitude: number,
    accuracyM: number,
  ): string {
    const name = userName ? userName : 'Your family member';
    const lat = latitude.toFixed(6);
    const lon = longitude.toFixed(6);
    const mapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;

    return `🚨 MARG RAKSHAK IMMEDIATE SOS!\n\n${name} pressed the EMERGENCY ALERT button and requires urgent assistance!\n\n📍 GPS Location: ${lat}, ${lon} (±${Math.round(accuracyM)}m)\n🗺️ Live Map: ${mapUrl}\n\nPlease contact them or alert Emergency Services (112) right away!`;
  }

  /**
   * Notification sent when starting a session in an unfamiliar or unsafe area.
   */
  formatSessionStartSms(
    userName: string,
    destination: string,
    latitude?: number,
    longitude?: number,
  ): string {
    const name = userName ? userName : 'Your family member';
    let locStr = '';
    if (latitude !== undefined && longitude !== undefined) {
      const lat = latitude.toFixed(6);
      const lon = longitude.toFixed(6);
      locStr = `\n📍 Current Location: https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
    }
    const destStr = destination ? ` traveling to "${destination}"` : '';
    return `🛡️ MARG RAKSHAK: ${name} started a safety session${destStr}. Automated no-movement monitoring is active via SIM network.${locStr}`;
  }

  /**
   * Confirmation sent when session concludes safely.
   */
  formatSafeArrivalSms(userName: string): string {
    const name = userName ? userName : 'Your family member';
    return `✅ MARG RAKSHAK: ${name} has ended their safety session and confirmed they are safe.`;
  }
}

export default new SmsService();
