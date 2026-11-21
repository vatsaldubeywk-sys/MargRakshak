// ─── Trusted Contacts ──────────────────────────────────────────────

export interface FamilyContact {
  id: string;
  name: string;
  phoneNumber: string;
  relationship: string; // e.g., 'Mother', 'Father', 'Spouse', 'Brother', 'Friend'
  isSelected: boolean;
  createdAt: number;
}

export interface TrustedContact {
  id: string;
  display_name: string;
  invited_email: string;
  status: string;
}

export interface SelectableContact extends TrustedContact {
  isSelected: boolean;
}

export interface CreateContactResult {
  contactId: string;
  status: string;
  invitationSent: boolean;
  invitationStatus: string;
}

// ─── Sessions ──────────────────────────────────────────────────────

export interface StartSessionResult {
  sessionId: string;
  expiresAt: string;
  nextCheckInAt: string;
}

export interface ActiveSession {
  id: string;
  status: string;
  expires_at: string;
  next_check_in_at: string;
  destination: string | null;
}

export interface CheckInResult {
  success: boolean;
  duplicate: boolean;
  status: string;
  nextCheckInAt: string;
}

// ─── SOS ───────────────────────────────────────────────────────────

export interface CreateSosResult {
  recorded: boolean;
  emailsAccepted: number;
  emailsAttempted: number;
  notificationStatus: string;
  deliveryConfirmed: boolean;
}

// ─── Generic ───────────────────────────────────────────────────────

export interface SimpleStatusResult {
  status: string;
  accepted: boolean;
  duplicate: boolean;
}

// ─── State ─────────────────────────────────────────────────────────

export type SessionState = 'idle' | 'active' | 'alert' | 'attention' | 'ended';

// ─── Location ──────────────────────────────────────────────────────

export interface LocationSample {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

// ─── Navigation ────────────────────────────────────────────────────

export type RootStackParamList = {
  Home: { sessionResult?: StartSessionResult } | undefined;
  Auth: undefined;
  Contacts: undefined;
  SessionSetup: { presetDuration?: number; presetDestination?: string } | undefined;
  Login?: undefined;
  SignUp?: undefined;
  AddContact?: undefined;
  ActiveSession?: { sessionId: string };
  SessionHistory?: undefined;
  Settings?: undefined;
};
