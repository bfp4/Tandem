import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signInWithEmail, signUpWithEmail } from '../services/authService';
import { useRouter } from 'expo-router';

type Mode = 'landing' | 'login' | 'signup';

function getSignUpPasswordError(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include an uppercase letter';
  }
  if (!/[^A-Za-z]/.test(password)) {
    return 'Password must include a number or symbol (non-letter)';
  }
  return null;
}

function getAuthErrorMessage(error: unknown, mode: 'login' | 'signup'): string {
  const code: string | undefined =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : undefined;

  switch (code) {
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'That password is too weak. Please choose a stronger one.';
    case 'auth/missing-password':
      return 'Please enter your password.';
    case 'auth/missing-email':
      return 'Please enter your email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'The email or password you entered is incorrect.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Email sign-in is currently disabled. Please try another method.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled. Please try again.';
  }

  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  if (message) return message;

  return mode === 'login'
    ? 'Could not sign in. Please try again.'
    : 'Could not create your account. Please try again.';
}

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  const clearError = () => {
    if (errorMessage) setErrorMessage(null);
  };

  const switchMode = (next: Mode) => {
    setErrorMessage(null);
    setMode(next);
  };

  const handleEmailLogin = async () => {
    if (!email || !password) {
      setErrorMessage('Please fill in all fields.');
      return;
    }
    setErrorMessage(null);
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      router.replace('/(tabs)/home' as any);
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, 'login'));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async () => {
    if (!email || !password || !confirmPassword) {
      setErrorMessage('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    const passwordError = getSignUpPasswordError(password);
    if (passwordError) {
      setErrorMessage(passwordError);
      return;
    }
    setErrorMessage(null);
    setLoading(true);
    try {
      await signUpWithEmail(email, password);
      router.replace('/signup/details' as any);
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, 'signup'));
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'landing') {
    return (
      <View style={styles.container}>
        <View style={styles.heroSection}>
          <View style={styles.logoContainer}>
            <Ionicons name="car-sport" size={60} color="#007AFF" />
          </View>
          <Text style={styles.appName}>Huber</Text>
          <Text style={styles.tagline}>Your ride, your way</Text>
        </View>

        <View style={styles.authSection}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => switchMode('signup')}
          >
            <Text style={styles.primaryButtonText}>Sign Up with Email</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => switchMode('login')}
          >
            <Text style={styles.secondaryButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backButton} onPress={() => switchMode('landing')}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>

        <View style={styles.formSection}>
          <Text style={styles.formTitle}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </Text>
          <Text style={styles.formSubtitle}>
            {mode === 'login' ? 'Sign in to continue' : 'Get started with Huber'}
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Email address"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              clearError();
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholderTextColor="#999"
          />
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                clearError();
              }}
              secureTextEntry={!showPassword}
              placeholderTextColor="#999"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword((v) => !v)}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Ionicons
                name={showPassword ? 'eye-off' : 'eye'}
                size={20}
                color="#888"
              />
            </TouchableOpacity>
          </View>
          {mode === 'signup' && (
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  clearError();
                }}
                secureTextEntry={!showConfirmPassword}
                placeholderTextColor="#999"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword((v) => !v)}
                accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color="#888"
                />
              </TouchableOpacity>
            </View>
          )}

          {errorMessage && (
            <View style={styles.errorBanner} accessibilityLiveRegion="polite">
              <Ionicons
                name="alert-circle"
                size={18}
                color="#B00020"
                style={styles.errorIcon}
              />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={mode === 'login' ? handleEmailLogin : handleEmailSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchLink}
            onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')}
          >
            <Text style={styles.switchLinkText}>
              {mode === 'login'
                ? "Don't have an account? Sign Up"
                : 'Already have an account? Sign In'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    paddingBottom: 40,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: '#EBF4FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  appName: {
    fontSize: 42,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: '#888',
    marginTop: 6,
  },
  authSection: {
    padding: 24,
    paddingBottom: 48,
  },
  formSection: {
    flex: 1,
    padding: 24,
    paddingTop: 80,
  },
  backButton: {
    position: 'absolute',
    top: 56,
    left: 24,
    zIndex: 10,
    padding: 4,
  },
  formTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
  },
  formSubtitle: {
    fontSize: 15,
    color: '#888',
    marginBottom: 28,
  },
  input: {
    backgroundColor: '#f7f7f7',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ebebeb',
    color: '#111',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7f7f7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ebebeb',
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#111',
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  switchLink: {
    alignItems: 'center',
    padding: 8,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FDECEE',
    borderWidth: 1,
    borderColor: '#F5B5BB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorIcon: {
    marginRight: 8,
    marginTop: 1,
  },
  errorText: {
    flex: 1,
    color: '#B00020',
    fontSize: 14,
    lineHeight: 20,
  },
  switchLinkText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
});
