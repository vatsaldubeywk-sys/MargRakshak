import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
  Image,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { COLORS } from '../constants';
import authService from '../services/authService';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

export const AuthScreen: React.FC<Props> = ({ navigation }) => {
  const isDark = useColorScheme() === 'dark';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkCurrentUser = useCallback(async () => {
    try {
      const session = await authService.getSession();
      if (session?.user?.email) {
        setSignedInEmail(session.user.email);
      } else {
        setSignedInEmail(null);
      }
    } catch {
      setSignedInEmail(null);
    }
  }, []);

  useEffect(() => {
    checkCurrentUser();
  }, [checkCurrentUser]);

  const sanitizeError = (error: unknown): string => {
    if (!error) return 'An unexpected error occurred. Please try again.';
    const raw = typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);

    const lower = raw.toLowerCase();
    if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
      return 'Invalid email or password. Please verify and try again.';
    }
    if (lower.includes('user already registered') || lower.includes('already exists')) {
      return 'An account with this email already exists. Try signing in instead.';
    }
    if (lower.includes('password') && lower.includes('least')) {
      return 'Password must be at least 6 characters long.';
    }
    if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch')) {
      return 'Network connection issue. Please check your internet connection.';
    }
    return raw;
  };

  const validateInput = (): boolean => {
    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMessage('Please enter a valid email address.');
      return false;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return false;
    }
    setErrorMessage(null);
    return true;
  };

  const handleSignIn = async () => {
    if (!validateInput()) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await authService.signIn(email.trim(), password);
      Alert.alert('Signed In', 'Welcome back to Marg Rakshak.', [
        {
          text: 'Continue',
          onPress: () => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('Home');
            }
          },
        },
      ]);
    } catch (err) {
      const sanitized = sanitizeError(err);
      setErrorMessage(sanitized);
      Alert.alert('Sign In Failed', sanitized);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!validateInput()) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await authService.signUp(email.trim(), password);
      Alert.alert(
        'Account Created',
        'Your Marg Rakshak account has been created. Check your email if verification is required.',
        [
          {
            text: 'OK',
            onPress: () => {
              checkCurrentUser();
            },
          },
        ],
      );
    } catch (err) {
      const sanitized = sanitizeError(err);
      setErrorMessage(sanitized);
      Alert.alert('Account Creation Failed', sanitized);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await authService.signOut();
      setSignedInEmail(null);
      setEmail('');
      setPassword('');
      Alert.alert('Signed Out', 'You have been successfully signed out.');
    } catch (err) {
      const sanitized = sanitizeError(err);
      Alert.alert('Sign Out Error', sanitized);
    } finally {
      setIsLoading(false);
    }
  };

  const dynamicStyles = {
    screenBg: isDark ? '#101719' : COLORS.background,
    cardBg: isDark ? '#1C272B' : COLORS.surface,
    textColor: isDark ? '#E2F1EC' : COLORS.textPrimary,
    secondaryText: isDark ? '#9EB3B8' : COLORS.textSecondary,
    inputBorder: isDark ? '#2E4148' : COLORS.border,
    inputBg: isDark ? '#131D21' : COLORS.surface,
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: dynamicStyles.screenBg }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/logo.png')}
            style={styles.authLogo}
            accessibilityLabel="Marg Rakshak App Icon"
          />
          <Text style={[styles.brandHeaderTitle, { color: COLORS.primary }]}>
            Marg Rakshak
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: dynamicStyles.cardBg }]}>
          <Text style={[styles.title, { color: dynamicStyles.textColor }]}>
            {signedInEmail ? 'Account Profile' : 'Sign In or Register'}
          </Text>
          <Text style={[styles.subtitle, { color: dynamicStyles.secondaryText }]}>
            {signedInEmail
              ? `Currently signed in as ${signedInEmail}`
              : 'Sign in for cloud features. Family SMS works without an account.'}
          </Text>

          {errorMessage ? (
            <View
              style={[
                styles.errorContainer,
                { backgroundColor: COLORS.dangerBg },
              ]}
              accessibilityLiveRegion="polite"
            >
              <Text style={[styles.errorText, { color: COLORS.dangerText }]}>
                {errorMessage}
              </Text>
            </View>
          ) : null}

          {signedInEmail ? (
            <View style={styles.signedInContainer}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: COLORS.danger }]}
                onPress={handleSignOut}
                disabled={isLoading}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Sign out of your account"
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.surface} />
                ) : (
                  <Text style={styles.actionButtonText}>Sign Out</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.formContainer}>
              <Text style={[styles.inputLabel, { color: dynamicStyles.textColor }]}>
                Email Address
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: dynamicStyles.inputBg,
                    borderColor: dynamicStyles.inputBorder,
                    color: dynamicStyles.textColor,
                  },
                ]}
                placeholder="name@example.com"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={text => {
                  setEmail(text);
                  if (errorMessage) setErrorMessage(null);
                }}
                accessible={true}
                accessibilityLabel="Email input field"
              />

              <Text style={[styles.inputLabel, { color: dynamicStyles.textColor }]}>
                Password
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: dynamicStyles.inputBg,
                    borderColor: dynamicStyles.inputBorder,
                    color: dynamicStyles.textColor,
                  },
                ]}
                placeholder="••••••••"
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry
                autoCapitalize="none"
                value={password}
                onChangeText={text => {
                  setPassword(text);
                  if (errorMessage) setErrorMessage(null);
                }}
                accessible={true}
                accessibilityLabel="Password input field"
              />

              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
              ) : (
                <View style={styles.buttonsContainer}>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: COLORS.primary }]}
                    onPress={handleSignIn}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel="Sign in button"
                  >
                    <Text style={styles.actionButtonText}>Sign In</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.secondaryButton,
                      { borderColor: COLORS.primary },
                    ]}
                    onPress={handleSignUp}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel="Create account button"
                  >
                    <Text
                      style={[
                        styles.secondaryButtonText,
                        { color: COLORS.primary },
                      ]}
                    >
                      Create Account
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    flexGrow: 1,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  authLogo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    marginBottom: 12,
  },
  brandHeaderTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  brandHeaderSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  card: {
    padding: 24,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '600',
  },
  formContainer: {
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    height: 50,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  loadingContainer: {
    marginVertical: 24,
    alignItems: 'center',
  },
  buttonsContainer: {
    marginTop: 24,
    gap: 12,
  },
  actionButton: {
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  signedInContainer: {
    marginTop: 20,
  },
});

export default AuthScreen;
