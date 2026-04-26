import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlertCircle,
  ArrowLeft,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Sparkles,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';
import { CompactSettingsSwitch } from './CompactSettingsSwitch';
import { generateUUID } from '@/lib/openclaw/utils';
import {
  buildDiagnostics,
  renderDiagnosticsPreview,
  type FeedbackDiagnostics,
} from '@/lib/feedback/diagnostics';
import {
  getFeedbackProxyUrl,
  submitFeedback,
  type FeedbackErrorCode,
  type FeedbackKind,
  type FeedbackResult,
} from '@/lib/feedback/submitFeedback';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

// ── Types ──────────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  onClose: () => void;
};

const TITLE_MIN = 4;
const TITLE_MAX = 120;
const BODY_MIN = 10;
const BODY_MAX = 8000;
const CONTACT_MAX = 200;

// ── Component ──────────────────────────────────────────────────────────────

export function FeedbackSheet({ visible, onClose }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [contact, setContact] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);

  // One nonce per opened sheet — survives in-flight retries against the
  // worker's idempotency cache so a double-tap or transient retry does
  // not create two issues.
  const nonceRef = useRef<string>(generateUUID());

  const proxyConfigured = getFeedbackProxyUrl() !== null;

  const diagnostics = useMemo<FeedbackDiagnostics>(() => buildDiagnostics(), []);
  const diagnosticsPreview = useMemo(() => renderDiagnosticsPreview(diagnostics), [diagnostics]);

  // Reset every time the sheet is closed so a re-open starts fresh
  // (including a new idempotency nonce).
  useEffect(() => {
    if (!visible) {
      // Defer slightly so the slide-out animation isn't disrupted by
      // re-render of the form contents.
      const t = setTimeout(() => {
        setKind('bug');
        setTitle('');
        setBody('');
        setContact('');
        setIncludeDiagnostics(true);
        setShowDiagnostics(false);
        setSubmitting(false);
        setResult(null);
        nonceRef.current = generateUUID();
      }, 250);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [visible]);

  // ── Validation ──────────────────────────────────────────────────────────

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const titleValid = trimmedTitle.length >= TITLE_MIN && trimmedTitle.length <= TITLE_MAX;
  const bodyValid = trimmedBody.length >= BODY_MIN && trimmedBody.length <= BODY_MAX;
  const contactValid = contact.trim().length <= CONTACT_MAX;
  const formValid = titleValid && bodyValid && contactValid;

  const isDirty = trimmedTitle.length > 0 || trimmedBody.length > 0 || contact.trim().length > 0;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleDismiss = useCallback((): void => {
    if (submitting) return;
    if (result?.ok) {
      onClose();
      return;
    }
    if (isDirtyRef.current) {
      Alert.alert('Discard feedback?', 'Your message will not be sent.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onClose },
      ]);
      return;
    }
    onClose();
  }, [onClose, submitting, result?.ok]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!formValid || submitting) return;
    setSubmitting(true);
    setResult(null);
    const res = await submitFeedback({
      kind,
      title: trimmedTitle,
      body: trimmedBody,
      contact: contact.trim() ? contact.trim() : undefined,
      diagnostics: includeDiagnostics ? diagnostics : undefined,
      clientNonce: nonceRef.current,
    });
    setResult(res);
    setSubmitting(false);
  }, [formValid, submitting, kind, trimmedTitle, trimmedBody, contact, includeDiagnostics, diagnostics]);

  const handleCopyFallback = useCallback(async (): Promise<void> => {
    const md = renderClipboardFallback({
      kind,
      title: trimmedTitle,
      body: trimmedBody,
      contact: contact.trim(),
      diagnostics: includeDiagnostics ? diagnosticsPreview : null,
    });
    await Clipboard.setStringAsync(md);
    Alert.alert(
      'Copied to clipboard',
      'Paste this into a new GitHub issue at github.com/kjswalls/clawboy-expo/issues',
    );
  }, [kind, trimmedTitle, trimmedBody, contact, includeDiagnostics, diagnosticsPreview]);

  const handleViewIssue = useCallback(async (): Promise<void> => {
    if (!result?.ok) return;
    await WebBrowser.openBrowserAsync(result.issueUrl);
  }, [result]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.flex, { backgroundColor: colors.background }]}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={handleDismiss}
            disabled={submitting}
            style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={result?.ok ? 'Close' : 'Cancel feedback'}
          >
            <ArrowLeft size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {result?.ok ? 'Thanks!' : 'Send feedback'}
          </Text>
          <View style={styles.headerIconBtn} />
        </View>

        {result?.ok ? (
          <SuccessView
            issueUrl={result.issueUrl}
            issueNumber={result.issueNumber}
            onViewIssue={() => { void handleViewIssue(); }}
            onClose={onClose}
          />
        ) : (
          <>
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {!proxyConfigured ? (
                <View style={[styles.warnCard, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}40` }]}>
                  <AlertCircle size={16} color={colors.warningText} style={{ marginTop: 1 }} />
                  <View style={styles.flex}>
                    <Text style={{ color: colors.warningText, fontSize: FontSize.sm, fontWeight: '600' }}>
                      Feedback service unavailable
                    </Text>
                    <Text style={{ color: colors.warningText, fontSize: FontSize.xs, marginTop: 2 }}>
                      This build isn't wired up to the feedback proxy. You can copy the message and paste it on GitHub instead.
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Type segmented control */}
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Type</Text>
              <View style={styles.segmentRow}>
                {(['bug', 'feature'] as FeedbackKind[]).map((k) => {
                  const active = kind === k;
                  const Icon = k === 'bug' ? Bug : Sparkles;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setKind(k)}
                      style={[
                        styles.segmentBtn,
                        active
                          ? { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}50` }
                          : { backgroundColor: colors.secondary, borderColor: 'transparent' },
                      ]}
                    >
                      <Icon size={14} color={active ? colors.primary : colors.mutedForeground} />
                      <Text style={{
                        fontSize: FontSize.sm,
                        fontWeight: '500',
                        color: active ? colors.primary : colors.mutedForeground,
                      }}>
                        {k === 'bug' ? 'Bug' : 'Feature'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Title */}
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Title</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.fieldRow}>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder={kind === 'bug' ? 'Brief summary of the bug' : 'One-line summary of your idea'}
                    placeholderTextColor={`${colors.mutedForeground}80`}
                    maxLength={TITLE_MAX}
                    autoCapitalize="sentences"
                    style={[styles.fieldInput, {
                      backgroundColor: colors.secondary,
                      borderColor: 'transparent',
                      color: colors.foreground,
                    }]}
                  />
                  <View style={styles.counterRow}>
                    <Text style={[styles.counter, { color: colors.mutedForeground }]}>
                      {trimmedTitle.length}/{TITLE_MAX}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Body */}
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                {kind === 'bug' ? 'What happened?' : 'Describe your idea'}
              </Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.fieldRow}>
                  <TextInput
                    value={body}
                    onChangeText={setBody}
                    placeholder={
                      kind === 'bug'
                        ? 'Steps to reproduce, what you expected, what actually happened.'
                        : 'What problem are you solving? How would you like it to work?'
                    }
                    placeholderTextColor={`${colors.mutedForeground}80`}
                    maxLength={BODY_MAX}
                    multiline
                    textAlignVertical="top"
                    style={[styles.fieldInput, styles.bodyInput, {
                      backgroundColor: colors.secondary,
                      borderColor: 'transparent',
                      color: colors.foreground,
                    }]}
                  />
                  <View style={styles.counterRow}>
                    <Text style={[styles.counter, { color: colors.mutedForeground }]}>
                      {trimmedBody.length}/{BODY_MAX}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Contact (optional) */}
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Contact (optional)</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.fieldRow}>
                  <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                    Email or GitHub handle. Only used if we need to follow up.
                  </Text>
                  <TextInput
                    value={contact}
                    onChangeText={setContact}
                    placeholder="you@example.com or @yourhandle"
                    placeholderTextColor={`${colors.mutedForeground}80`}
                    maxLength={CONTACT_MAX}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    style={[styles.fieldInput, styles.mono, {
                      backgroundColor: colors.secondary,
                      borderColor: 'transparent',
                      color: colors.foreground,
                    }]}
                  />
                </View>
              </View>

              {/* Diagnostics toggle */}
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Diagnostics</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Pressable
                  onPress={() => setIncludeDiagnostics((v) => !v)}
                  style={({ pressed }) => [styles.toggleRow, pressed && { opacity: 0.75 }]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: includeDiagnostics }}
                >
                  <View style={styles.flex}>
                    <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
                      Include diagnostics
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 2 }}>
                      App version, OS, and device model. Never tokens or URLs.
                    </Text>
                  </View>
                  <CompactSettingsSwitch value={includeDiagnostics} />
                </Pressable>

                {includeDiagnostics ? (
                  <>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <Pressable
                      onPress={() => setShowDiagnostics((v) => !v)}
                      style={({ pressed }) => [styles.toggleRow, pressed && { opacity: 0.75 }]}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, flex: 1 }}>
                        {showDiagnostics ? 'Hide preview' : 'Preview what will be sent'}
                      </Text>
                      {showDiagnostics ? (
                        <ChevronUp size={14} color={colors.mutedForeground} />
                      ) : (
                        <ChevronDown size={14} color={colors.mutedForeground} />
                      )}
                    </Pressable>
                    {showDiagnostics ? (
                      <View style={[styles.previewBox, { backgroundColor: colors.secondary }]}>
                        <Text style={[styles.previewText, styles.mono, { color: colors.foreground }]}>
                          {diagnosticsPreview}
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>

              <View style={{ height: Spacing.lg }} />
            </ScrollView>

            {/* Pinned footer */}
            <View style={[
              styles.footer,
              {
                borderTopColor: colors.border,
                backgroundColor: `${colors.card}E8`,
                paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.sm,
              },
            ]}>
              {result && !result.ok ? (
                <View style={[
                  styles.footerError,
                  { backgroundColor: `${colors.destructive}10`, borderColor: `${colors.destructive}28` },
                ]}>
                  <AlertCircle size={15} color={colors.destructive} style={{ flexShrink: 0, marginTop: 1 }} />
                  <View style={styles.flex}>
                    <Text style={{ color: colors.destructive, fontSize: FontSize.xs, fontWeight: '600' }}>
                      {errorTitle(result.code)}
                    </Text>
                    <Text style={{ color: colors.destructive, fontSize: FontSize.xs, opacity: 0.85, marginTop: 1 }}>
                      {result.message}
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.footerBtnRow}>
                {!proxyConfigured ? (
                  <Pressable
                    onPress={() => { void handleCopyFallback(); }}
                    disabled={!formValid || submitting}
                    style={({ pressed }) => [
                      styles.submitBtn,
                      {
                        backgroundColor: formValid ? colors.secondary : colors.muted,
                        borderColor: formValid ? colors.foreground : colors.border,
                      },
                      pressed && { opacity: 0.82 },
                    ]}
                  >
                    <Text style={{
                      color: formValid ? colors.foreground : colors.mutedForeground,
                      fontSize: FontSize.xs,
                      fontWeight: '500',
                    }}>
                      Copy to clipboard
                    </Text>
                    <ChevronRight size={13} color={formValid ? colors.foreground : colors.mutedForeground} />
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => { void handleSubmit(); }}
                    disabled={!formValid || submitting}
                    style={({ pressed }) => [
                      styles.submitBtn,
                      {
                        backgroundColor: formValid ? colors.secondary : colors.muted,
                        borderColor: formValid ? colors.foreground : colors.border,
                      },
                      pressed && { opacity: 0.82 },
                    ]}
                  >
                    {submitting ? <ActivityIndicator size="small" color={colors.mutedForeground} /> : null}
                    <Text style={{
                      color: formValid ? colors.foreground : colors.mutedForeground,
                      fontSize: FontSize.xs,
                      fontWeight: '500',
                    }}>
                      {submitting ? 'Sending…' : 'Send feedback'}
                    </Text>
                    {!submitting ? (
                      <ChevronRight size={13} color={formValid ? colors.foreground : colors.mutedForeground} />
                    ) : null}
                  </Pressable>
                )}
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

type SuccessProps = {
  issueUrl: string;
  issueNumber: number;
  onViewIssue: () => void;
  onClose: () => void;
};

function SuccessView({ issueUrl, issueNumber, onViewIssue, onClose }: SuccessProps): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.successWrap, { backgroundColor: colors.background }]}>
      <View style={[styles.successIcon, { backgroundColor: `${colors.success}20` }]}>
        <CheckCircle2 size={36} color={colors.success} />
      </View>
      <Text style={[styles.successTitle, { color: colors.foreground }]}>Feedback submitted</Text>
      <Text style={[styles.successSubtitle, { color: colors.mutedForeground }]}>
        Tracked as issue #{issueNumber}. Thanks for taking the time.
      </Text>
      <Text
        style={[styles.successUrl, { color: colors.mutedForeground }]}
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {issueUrl}
      </Text>

      <View style={styles.successBtnRow}>
        <Pressable
          onPress={onViewIssue}
          style={({ pressed }) => [
            styles.successPrimaryBtn,
            { backgroundColor: colors.secondary, borderColor: colors.foreground },
            pressed && { opacity: 0.82 },
          ]}
          accessibilityRole="link"
        >
          <ExternalLink size={14} color={colors.foreground} />
          <Text style={{ color: colors.foreground, fontSize: FontSize.xs, fontWeight: '500' }}>
            View on GitHub
          </Text>
        </Pressable>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.successSecondaryBtn,
            { borderColor: colors.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, fontWeight: '500' }}>
            Done
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function errorTitle(code: FeedbackErrorCode): string {
  switch (code) {
    case 'rate_limited': return 'Slow down';
    case 'leak_blocked': return 'Looks like a URL or token';
    case 'validation': return 'Check your input';
    case 'timeout': return 'Request timed out';
    case 'network': return 'No connection';
    case 'not_configured': return 'Not configured';
    case 'server': return 'Something went wrong';
  }
}

function renderClipboardFallback(input: {
  kind: FeedbackKind;
  title: string;
  body: string;
  contact: string;
  diagnostics: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`# [${input.kind === 'bug' ? 'Bug' : 'Feature'}] ${input.title}`);
  lines.push('');
  lines.push(input.body);
  lines.push('');
  if (input.diagnostics) {
    lines.push('## Diagnostics');
    lines.push('');
    lines.push(input.diagnostics);
    lines.push('');
  }
  if (input.contact.length > 0) {
    lines.push(`> Contact: ${input.contact}`);
    lines.push('');
  }
  lines.push('<sub>Submitted via the in-app feedback form.</sub>');
  return lines.join('\n');
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerIconBtn: { padding: 6, marginLeft: -4, width: 36 },
  headerTitle: { fontSize: FontSize.sm, fontWeight: '500' },
  scrollContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  warnCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: '500', marginBottom: 10, marginTop: Spacing.md },
  segmentRow: { flexDirection: 'row', gap: Spacing.sm },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  fieldRow: { paddingHorizontal: 12, paddingVertical: 10 },
  fieldHint: { fontSize: FontSize.xs, lineHeight: 16, marginBottom: 6 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: FontSize.sm,
  },
  bodyInput: {
    minHeight: 140,
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 4,
  },
  counter: { fontSize: 11 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
  previewBox: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 10,
    borderRadius: BorderRadius.md,
  },
  previewText: { fontSize: 11, lineHeight: 16 },

  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  footerError: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  footerBtnRow: { flexDirection: 'row' },
  submitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
  },

  // Success state
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  successTitle: { fontSize: FontSize.lg, fontWeight: '600' },
  successSubtitle: { fontSize: FontSize.sm, textAlign: 'center' },
  successUrl: { fontSize: FontSize.xs, opacity: 0.7, marginTop: Spacing.xs },
  successBtnRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  successPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
  },
  successSecondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
  },
});
