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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        Alert.alert(t('auth.signInSheet.appleFailedTitle'), e?.message ?? t('auth.signInSheet.genericFailedBody'));
      }
    } finally {
      setBusy(false);
    }
  }, [signInWithApple, t]);

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
      Alert.alert(t('auth.signInSheet.googleFailedTitle'), e?.message ?? t('auth.signInSheet.genericFailedBody'));
    } finally {
      setBusy(false);
    }
  }, [signInWithGoogle, t]);

  // ─── Email ────────────────────────────────────────────────────────────────

  const handleSendEmail = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      Alert.alert(t('auth.signInSheet.invalidEmailTitle'), t('auth.signInSheet.invalidEmailBody'));
      return;
    }
    setBusy(true);
    try {
      await signInWithEmail(trimmed);
      setScreen('sent');
    } catch (err: unknown) {
      const e = err as { message?: string };
      Alert.alert(t('auth.signInSheet.magicLinkFailedTitle'), e?.message ?? t('auth.signInSheet.genericFailedBody'));
    } finally {
      setBusy(false);
    }
  }, [email, signInWithEmail, t]);

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
              {screen === 'sent' ? t('auth.signInSheet.titleCheckEmail') : t('auth.signInSheet.titleSignIn')}
            </Text>
            <Pressable
              onPress={dismiss}
              disabled={busy}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel={t('auth.signInSheet.closeLabel')}
              accessibilityRole="button"
            >
              <X size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {screen === 'choose' && (
            <ChooseScreen
              colors={colors}
              busy={busy}
              t={t}
              onApple={handleApple}
              onGoogle={handleGoogle}
              onEmail={() => setScreen('email')}
            />
          )}

          {screen === 'email' && (
            <EmailScreen
              colors={colors}
              busy={busy}
              t={t}
              email={email}
              setEmail={setEmail}
              onSend={handleSendEmail}
              onBack={() => setScreen('choose')}
            />
          )}

          {screen === 'sent' && (
            <SentScreen
              colors={colors}
              t={t}
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
              accessibilityLabel={t('auth.signInSheet.skipLabel')}
              accessibilityRole="button"
            >
              <Text style={[styles.skipText, { color: colors.mutedForeground }]}>
                {t('auth.signInSheet.skipNote')}
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

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

function ChooseScreen({
  colors, busy, t, onApple, onGoogle, onEmail,
}: {
  colors: ThemeColors;
  busy: boolean;
  t: TFunc;
  onApple: () => void;
  onGoogle: () => void;
  onEmail: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.body}>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {t('auth.signInSheet.subtitleChoose')}
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
      <GoogleSignInButton busy={busy} t={t} onPress={onGoogle} />

      {/* Email magic-link */}
      <AuthButton
        label={t('auth.signInSheet.emailMagicLinkBtn')}
        icon={<Mail size={16} color={colors.mutedForeground} />}
        colors={colors}
        busy={busy}
        accessibilityLabel={t('auth.signInSheet.emailMagicLinkA11y')}
        onPress={onEmail}
      />
    </View>
  );
}

function EmailScreen({
  colors, busy, t, email, setEmail, onSend, onBack,
}: {
  colors: ThemeColors;
  busy: boolean;
  t: TFunc;
  email: string;
  setEmail: (v: string) => void;
  onSend: () => void;
  onBack: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.body}>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {t('auth.signInSheet.subtitleEmail')}
      </Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder={t('auth.signInSheet.emailPlaceholder')}
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
        accessibilityLabel={t('auth.signInSheet.emailA11y')}
      />

      <Pressable
        onPress={onSend}
        disabled={busy}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: colors.primary, opacity: (pressed || busy) ? 0.7 : 1 },
        ]}
        accessibilityLabel={t('auth.signInSheet.sendBtnA11y')}
        accessibilityRole="button"
      >
        <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
          {busy ? t('auth.signInSheet.sendingBtn') : t('auth.signInSheet.sendBtn')}
        </Text>
      </Pressable>

      <Pressable
        onPress={onBack}
        disabled={busy}
        style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        accessibilityLabel={t('auth.signInSheet.backA11y')}
      >
        <Text style={[styles.backText, { color: colors.mutedForeground }]}>
          {t('auth.signInSheet.backOptions')}
        </Text>
      </Pressable>
    </View>
  );
}

function SentScreen({
  colors, t, email, onDone,
}: {
  colors: ThemeColors;
  t: TFunc;
  email: string;
  onDone: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.body}>
      <View style={[styles.sentIcon, { backgroundColor: `${colors.primary}20` }]}>
        <Mail size={28} color={colors.primary} />
      </View>
      <Text style={[styles.sentTitle, { color: colors.foreground }]}>
        {t('auth.signInSheet.magicLinkSentTitle')}
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {t('auth.signInSheet.magicLinkSentBody', { email })}
      </Text>
      <Pressable
        onPress={onDone}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityLabel={t('auth.signInSheet.doneA11y')}
        accessibilityRole="button"
      >
        <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
          {t('auth.signInSheet.doneBtn')}
        </Text>
      </Pressable>
    </View>
  );
}

function GoogleSignInButton({
  busy, t, onPress,
}: { busy: boolean; t: TFunc; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.googleBtn,
        { opacity: (pressed || busy) ? 0.7 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={t('auth.signInSheet.googleA11y')}
    >
      <GoogleGLogo size={18} />
      <Text style={styles.googleBtnLabel}>{t('auth.signInSheet.googleBtn')}</Text>
    </Pressable>
  );
}

function AuthButton({
  label, icon, iconLetter, iconColor, colors, busy, accessibilityLabel, onPress,
}: {
  label: string;
  icon?: React.ReactNode;
  iconLetter?: string;
  iconColor?: string;
  colors: ThemeColors;
  busy: boolean;
  accessibilityLabel?: string;
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
      accessibilityLabel={accessibilityLabel ?? label}
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
