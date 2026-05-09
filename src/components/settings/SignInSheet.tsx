/**
 * SignInSheet — bottom-sheet with three auth flows.
 *
 * Opened by AccountSection when the user taps "Sign in (optional)".
 * The sheet is dismissible at any time; no sign-in is required.
 *
 * Screens inside the sheet:
 *   'choose'  — Apple / Google / Email buttons
 *   'email'   — email input + send magic-link
 *   'sent'    — confirmation that the magic-link email was sent
 */

import React, { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mail, X } from 'lucide-react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleGLogo } from '@/components/common/GoogleGLogo';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAccount } from '@/hooks/useAccount';

// ─────────────────────────────────────────────────────────────────────────────
// Public ref API
// ─────────────────────────────────────────────────────────────────────────────

export interface SignInSheetRef {
  present: () => void;
  dismiss: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

type Screen = 'choose' | 'email' | 'sent';

export const SignInSheet = forwardRef<SignInSheetRef>((_, ref) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { signInWithApple, signInWithGoogle, signInWithEmail } = useAccount();

  const [visible, setVisible] = useState(false);
  const [screen, setScreen] = useState<Screen>('choose');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  useImperativeHandle(ref, () => ({
    present: () => {
      setScreen('choose');
      setEmail('');
      setBusy(false);
      setVisible(true);
    },
    dismiss: () => setVisible(false),
  }));

  const dismiss = useCallback(() => {
    if (busy) return;
    setVisible(false);
  }, [busy]);

  // ─── Apple ───────────────────────────────────────────────────────────────

  const handleApple = useCallback(async () => {
    setBusy(true);
    try {
      await signInWithApple();
      setVisible(false);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      // ERR_CANCELED = user dismissed native sheet — no alert needed
      if (e?.code !== 'ERR_CANCELED') {
        Alert.alert('Apple Sign-In failed', e?.message ?? 'An error occurred. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }, [signInWithApple]);

  // ─── Google ───────────────────────────────────────────────────────────────

  const handleGoogle = useCallback(async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
      // Defer the dismiss by one frame so the Modal's hide animation commits in
      // a separate render pass from any auth-state-driven re-render of the host
      // (AccountSection). This prevents a race where onAuthStateChange fires
      // synchronously inside signInWithGoogle(), causing the host to unmount
      // SignInSheet before setVisible(false) can run, leaving a black UIWindow.
      requestAnimationFrame(() => setVisible(false));
    } catch (err: unknown) {
      const e = err as { message?: string };
      Alert.alert('Google Sign-In failed', e?.message ?? 'An error occurred. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [signInWithGoogle]);

  // ─── Email ────────────────────────────────────────────────────────────────

  const handleSendEmail = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      await signInWithEmail(trimmed);
      setScreen('sent');
    } catch (err: unknown) {
      const e = err as { message?: string };
      Alert.alert('Magic link failed', e?.message ?? 'An error occurred. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [email, signInWithEmail]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={dismiss} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kvWrapper}
      >
        <View style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            paddingBottom: Math.max(insets.bottom + Spacing.lg, Spacing['2xl']),
          },
        ]}>
          {/* Handle bar */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {screen === 'sent' ? 'Check your email' : 'Sign in to ClawBoy'}
            </Text>
            <Pressable
              onPress={dismiss}
              disabled={busy}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Close sign-in sheet"
              accessibilityRole="button"
            >
              <X size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {screen === 'choose' && (
            <ChooseScreen
              colors={colors}
              busy={busy}
              onApple={handleApple}
              onGoogle={handleGoogle}
              onEmail={() => setScreen('email')}
            />
          )}

          {screen === 'email' && (
            <EmailScreen
              colors={colors}
              busy={busy}
              email={email}
              setEmail={setEmail}
              onSend={handleSendEmail}
              onBack={() => setScreen('choose')}
            />
          )}

          {screen === 'sent' && (
            <SentScreen
              colors={colors}
              email={email}
              onDone={() => setVisible(false)}
            />
          )}

          {/* Skip / local-only note */}
          {screen !== 'sent' && (
            <Pressable
              onPress={dismiss}
              disabled={busy}
              style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Skip sign-in"
              accessibilityRole="button"
            >
              <Text style={[styles.skipText, { color: colors.mutedForeground }]}>
                Skip — continue without an account
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

SignInSheet.displayName = 'SignInSheet';

// ─────────────────────────────────────────────────────────────────────────────
// Sub-screens
// ─────────────────────────────────────────────────────────────────────────────

import type { ThemeColors } from '@/types';

function ChooseScreen({
  colors, busy, onApple, onGoogle, onEmail,
}: {
  colors: ThemeColors;
  busy: boolean;
  onApple: () => void;
  onGoogle: () => void;
  onEmail: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.body}>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        An account lets you restore your gateway list on a new device. Your chat history and
        gateway credentials always stay on-device.
      </Text>

      {/* Apple Sign-In — uses the native Apple button for App Store compliance */}
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={BorderRadius.md}
        style={styles.appleBtn}
        onPress={onApple}
      />

      {/* Google */}
      <GoogleSignInButton busy={busy} onPress={onGoogle} />

      {/* Email magic-link */}
      <AuthButton
        label="Email me a magic link"
        icon={<Mail size={16} color={colors.mutedForeground} />}
        colors={colors}
        busy={busy}
        onPress={onEmail}
      />
    </View>
  );
}

function EmailScreen({
  colors, busy, email, setEmail, onSend, onBack,
}: {
  colors: ThemeColors;
  busy: boolean;
  email: string;
  setEmail: (v: string) => void;
  onSend: () => void;
  onBack: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.body}>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        We'll send a magic link to your inbox — no password needed.
      </Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={colors.mutedForeground}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="send"
        onSubmitEditing={onSend}
        editable={!busy}
        style={[
          styles.emailInput,
          {
            backgroundColor: colors.input,
            borderColor: colors.border,
            color: colors.foreground,
          },
        ]}
        accessibilityLabel="Email address"
      />

      <Pressable
        onPress={onSend}
        disabled={busy}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: colors.primary, opacity: (pressed || busy) ? 0.7 : 1 },
        ]}
        accessibilityLabel="Send magic link"
        accessibilityRole="button"
      >
        <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
          {busy ? 'Sending…' : 'Send magic link'}
        </Text>
      </Pressable>

      <Pressable
        onPress={onBack}
        disabled={busy}
        style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        accessibilityLabel="Back to sign-in options"
      >
        <Text style={[styles.backText, { color: colors.mutedForeground }]}>← Other options</Text>
      </Pressable>
    </View>
  );
}

function SentScreen({
  colors, email, onDone,
}: {
  colors: ThemeColors;
  email: string;
  onDone: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.body}>
      <View style={[styles.sentIcon, { backgroundColor: `${colors.primary}20` }]}>
        <Mail size={28} color={colors.primary} />
      </View>
      <Text style={[styles.sentTitle, { color: colors.foreground }]}>Magic link sent</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        We sent a sign-in link to{' '}
        <Text style={{ color: colors.foreground, fontWeight: FontWeight.medium }}>{email}</Text>.
        Tap the link in your email to complete sign-in.
      </Text>
      <Pressable
        onPress={onDone}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityLabel="Done"
        accessibilityRole="button"
      >
        <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Done</Text>
      </Pressable>
    </View>
  );
}

function GoogleSignInButton({
  busy, onPress,
}: { busy: boolean; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.googleBtn,
        { opacity: (pressed || busy) ? 0.7 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Sign in with Google"
    >
      <GoogleGLogo size={18} />
      <Text style={styles.googleBtnLabel}>Sign in with Google</Text>
    </Pressable>
  );
}

function AuthButton({
  label, icon, iconLetter, iconColor, colors, busy, onPress,
}: {
  label: string;
  icon?: React.ReactNode;
  iconLetter?: string;
  iconColor?: string;
  colors: ThemeColors;
  busy: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.authBtn,
        {
          backgroundColor: colors.secondary,
          borderColor: colors.border,
          opacity: (pressed || busy) ? 0.7 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.authBtnIcon}>
        {icon ?? (
          <Text style={{ fontSize: 15, fontWeight: FontWeight.bold, color: iconColor }}>
            {iconLetter}
          </Text>
        )}
      </View>
      <Text style={[styles.authBtnLabel, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  kvWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    gap: Spacing.md,
  },
  subtitle: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  appleBtn: {
    width: '100%',
    height: 48,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: '#131314',
    paddingHorizontal: Spacing.md,
  },
  googleBtnLabel: {
    fontSize: 17,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0,
    color: '#FFFFFF',
  },
  authBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 48,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
  },
  authBtnIcon: {
    width: 20,
    alignItems: 'center',
  },
  authBtnLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  emailInput: {
    height: 44,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
  },
  primaryBtn: {
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  backText: {
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  sentIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  sentTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  skipBtn: {
    marginTop: Spacing.lg,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  skipText: {
    fontSize: FontSize.xs,
  },
});
