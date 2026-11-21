import { Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

/**
 * Thin auth wrapper around Supabase Auth.
 * Every method throws on failure so callers can catch uniformly.
 */
const authService = {
  /** Create a new account; throws on error. */
  async signUp(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      throw error;
    }
  },

  /** Sign in with email + password; throws on error. */
  async signIn(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw error;
    }
  },

  /** Sign out the current user. */
  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  },

  /** Return the current session, or null if none. */
  async getSession(): Promise<Session | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }
    return data.session;
  },

  /** Return the current access token or throw "Sign in required". */
  async getAccessToken(): Promise<string> {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }
    const token = data.session?.access_token;
    if (!token) {
      throw new Error('Sign in required');
    }
    return token;
  },

  /**
   * Subscribe to auth state changes.
   * Returns the unsubscribe function.
   */
  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ): () => void {
    const { data } = supabase.auth.onAuthStateChange(callback);
    return () => {
      data.subscription.unsubscribe();
    };
  },

  /** Quick boolean check for whether a session exists. */
  async isSignedIn(): Promise<boolean> {
    const session = await authService.getSession();
    return session !== null;
  },
};

export default authService;
