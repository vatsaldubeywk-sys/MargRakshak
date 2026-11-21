import { supabase } from './supabaseClient';
import type {
  TrustedContact,
  CreateContactResult,
  SimpleStatusResult,
  StartSessionResult,
  ActiveSession,
  CheckInResult,
  CreateSosResult,
} from '../types';

/**
 * Wrapper for all Supabase Edge-Function calls and PostgREST queries
 * used by the SafePath (Marg Rakshak) app.
 */
const functionsService = {
  // ──────────────────── PostgREST queries ────────────────────

  /** Fetch the user's trusted contacts list. */
  async listContacts(): Promise<TrustedContact[]> {
    const { data, error } = await supabase
      .from('trusted_contacts')
      .select('id, display_name, invited_email, status');

    if (error) {
      throw error;
    }
    return (data ?? []) as TrustedContact[];
  },

  /** Fetch an active session by its ID. Returns null when not found. */
  async getSession(sessionId: string): Promise<ActiveSession | null> {
    const { data, error } = await supabase
      .from('safety_sessions')
      .select('id, status, expires_at, next_check_in_at, destination')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) {
      throw error;
    }
    return (data as ActiveSession) ?? null;
  },

  // ──────────────────── Edge-Function calls ────────────────────

  /** Create (invite) a trusted contact. */
  async createContact(
    displayName: string,
    email: string,
  ): Promise<CreateContactResult> {
    const { data, error } = await supabase.functions.invoke('create-contact', {
      body: { displayName, email },
    });
    if (error) {
      throw error;
    }
    return data as CreateContactResult;
  },

  /** Accept a pending contact invitation. */
  async acceptContact(contactId: string): Promise<SimpleStatusResult> {
    const { data, error } = await supabase.functions.invoke('accept-contact', {
      body: { contactId },
    });
    if (error) {
      throw error;
    }
    return data as SimpleStatusResult;
  },

  /** Revoke (remove) a trusted contact. */
  async revokeContact(contactId: string): Promise<SimpleStatusResult> {
    const { data, error } = await supabase.functions.invoke('revoke-contact', {
      body: { contactId },
    });
    if (error) {
      throw error;
    }
    return data as SimpleStatusResult;
  },

  /** Start a new safety session. */
  async startSession(
    durationMinutes: number,
    contactIds: string[],
    destination?: string | null,
  ): Promise<StartSessionResult> {
    const { data, error } = await supabase.functions.invoke('start-session', {
      body: { durationMinutes, contactIds, destination: destination || null },
    });
    if (error) {
      throw error;
    }
    return data as StartSessionResult;
  },

  /** Push a location sample for an active session. */
  async updateLocation(
    sessionId: string,
    sampleKey: string,
    lat: number,
    lng: number,
    accuracy: number,
  ): Promise<SimpleStatusResult> {
    const { data, error } = await supabase.functions.invoke('update-location', {
      body: {
        sessionId,
        sampleKey,
        latitude: lat,
        longitude: lng,
        accuracyM: accuracy,
      },
    });
    if (error) {
      throw error;
    }
    return data as SimpleStatusResult;
  },

  /** Trigger an SOS alert for the given session. */
  async createSos(
    sessionId: string,
    eventKey: string,
  ): Promise<CreateSosResult> {
    const { data, error } = await supabase.functions.invoke('create-sos', {
      body: { sessionId, eventKey },
    });
    if (error) {
      throw error;
    }
    return data as CreateSosResult;
  },

  /** Confirm the user is safe (check-in). */
  async checkIn(
    sessionId: string,
    eventKey: string,
  ): Promise<CheckInResult> {
    const { data, error } = await supabase.functions.invoke('check-in', {
      body: { sessionId, eventKey },
    });
    if (error) {
      throw error;
    }
    return data as CheckInResult;
  },

  /** End an active session early. */
  async endSession(sessionId: string): Promise<SimpleStatusResult> {
    const { data, error } = await supabase.functions.invoke('end-session', {
      body: { sessionId },
    });
    if (error) {
      throw error;
    }
    return data as SimpleStatusResult;
  },
};

export default functionsService;
