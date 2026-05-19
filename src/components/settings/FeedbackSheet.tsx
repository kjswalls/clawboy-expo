import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/useTheme';
import { useConnection } from '@/contexts/ConnectionContext';
import { useServerConfig } from '@/hooks/useServerConfig';
import { generateUUID } from '@/lib/openclaw/utils';
import {
  buildDiagnostics,
  buildConnectionDiagnostics,
  renderDiagnosticsPreview,
  type FeedbackDiagnostics,
} from '@/lib/feedback/diagnostics';
import {
  getFeedbackProxyUrl,
  submitFeedback,
  type FeedbackKind,
  type FeedbackResult,
} from '@/lib/feedback/submitFeedback';
import {
  prepareFeedbackScreenshots,
  FEEDBACK_SCREENSHOT_MAX_COUNT,
  type FeedbackScreenshot,
} from '@/lib/feedback/prepareFeedbackScreenshots';
import { useRecentScreenshots } from '@/lib/feedback/useRecentScreenshots';
import { tapHaptic, successHaptic } from '@/components/input/attachmentSheet/AttachmentSheetShared';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { getRecentLogs } from '@/lib/diagnostics/consoleBuffer';
import { useLastCrash } from '@/contexts/LastCrashContext';

import { FeedbackFormBody } from './FeedbackFormBody';
import { FeedbackScreenshotRail } from './FeedbackScreenshotRail';
import { FeedbackDiagnosticsRow } from './FeedbackDiagnosticsRow';
import { FeedbackLogsRow } from './FeedbackLogsRow';
import { FeedbackSuccessView } from './FeedbackSuccessView';
import {
  errorTitle,
  renderClipboardFallback,
  TITLE_MIN,
  TITLE_MAX,
  BODY_MIN,
  BODY_MAX,
  CONTACT_MAX,
  type ScreenshotItem,
} from './feedbackHelpers';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function FeedbackSheet({ visible, onClose }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { connectionState, connectGeneration } = useConnection();
  const { activeProfile } = useServerConfig();
  const { lastCrash, dismiss: dismissCrash } = useLastCrash();

  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [contact, setContact] = useState('');
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [includeLogs, setIncludeLogs] = useState(false);
  const [showLogsPreview, setShowLogsPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const multiBarH = useSharedValue(0);
  const prevSelectedCount = useRef(0);

  const nonceRef = useRef<string>(generateUUID());
  const prevVisibleRef = React.useRef(false);

  const proxyConfigured = getFeedbackProxyUrl() !== null;

  const connectionDiag = useMemo(
    () => buildConnectionDiagnostics(connectionState, connectGeneration, activeProfile?.security),
    [connectionState, connectGeneration, activeProfile?.security],
  );
  const diagnostics = useMemo<FeedbackDiagnostics>(
    () => buildDiagnostics({ connection: connectionDiag }),
    [connectionDiag],
  );
  const diagnosticsPreview = useMemo(() => renderDiagnosticsPreview(diagnostics), [diagnostics]);

  const { assets: recentAssets, status: permissionStatus, requestPermission } = useRecentScreenshots(16);

  // Multi-select confirm bar animation
  useEffect(() => {
    const count = selectedIds.size;
    if (count !== prevSelectedCount.current) {
      prevSelectedCount.current = count;
      multiBarH.value = withSpring(count > 0 ? 48 : 0, { damping: 22, stiffness: 220 });
    }
  }, [selectedIds.size, multiBarH]);

  const multiBarStyle = useAnimatedStyle(() => ({
    height: multiBarH.value,
    overflow: 'hidden',
  }));

  // Reset on close
  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(() => {
        setKind('bug');
        setTitle('');
        setBody('');
        setContact('');
        setScreenshots([]);
        setIncludeDiagnostics(true);
        setShowDiagnostics(false);
        setIncludeLogs(false);
        setShowLogsPreview(false);
        setSubmitting(false);
        setResult(null);
        setSelectedIds(new Set());
        multiBarH.value = 0;
        prevSelectedCount.current = 0;
        nonceRef.current = generateUUID();
      }, 250);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [visible, multiBarH]);

  // Pre-fill from crash record on open
  useEffect(() => {
    const justOpened = visible && !prevVisibleRef.current;
    prevVisibleRef.current = visible;
    if (justOpened && lastCrash) {
      setKind('bug');
      const ts = new Date(lastCrash.ts).toLocaleString();
      setTitle(`Crash on ${ts}`);
      setBody(
        `The app crashed on my last session (${ts}).\n\n` +
        `**Error:** ${lastCrash.name}: ${lastCrash.message}\n\n` +
        `**What I was doing:** (please describe)\n`,
      );
    }
  }, [visible, lastCrash]);

  // Validation
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const titleValid = trimmedTitle.length >= TITLE_MIN && trimmedTitle.length <= TITLE_MAX;
  const bodyValid = trimmedBody.length >= BODY_MIN && trimmedBody.length <= BODY_MAX;
  const contactValid = contact.trim().length <= CONTACT_MAX;
  const formValid = titleValid && bodyValid && contactValid;

  const isDirty = trimmedTitle.length > 0 || trimmedBody.length > 0 || contact.trim().length > 0 || screenshots.length > 0;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const handleDismiss = useCallback((): void => {
    if (submitting) return;
    if (result?.ok) { onClose(); return; }
    if (isDirtyRef.current) {
      Alert.alert(t('feedback.discardTitle'), t('feedback.discardBody'), [
        { text: t('feedback.keepEditing'), style: 'cancel' },
        { text: t('feedback.discardBtn'), style: 'destructive', onPress: onClose },
      ]);
      return;
    }
    onClose();
  }, [t, onClose, submitting, result?.ok]);

  const addScreenshotFromLibrary = useCallback(async (): Promise<void> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('feedback.permissionTitle'), t('feedback.permissionBody'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (res.canceled) return;
    setScreenshots((prev) => {
      const slots = FEEDBACK_SCREENSHOT_MAX_COUNT - prev.length;
      const picked = res.assets.slice(0, slots).map((a) => ({ id: generateUUID(), uri: a.uri }));
      return [...prev, ...picked];
    });
  }, [t]);

  const attachAssetsAsScreenshots = useCallback(async (assets: MediaLibrary.Asset[]): Promise<void> => {
    const slots = FEEDBACK_SCREENSHOT_MAX_COUNT - screenshots.length;
    if (slots <= 0) return;
    const clamped = assets.slice(0, slots);
    const resolved: ScreenshotItem[] = [];
    for (const asset of clamped) {
      try {
        const info = await MediaLibrary.getAssetInfoAsync(asset);
        const uri = info.localUri ?? asset.uri;
        resolved.push({ id: generateUUID(), uri });
      } catch { /* skip unresolvable assets */ }
    }
    if (resolved.length > 0) setScreenshots((prev) => [...prev, ...resolved]);
  }, [screenshots.length]);

  const handleRecentPress = useCallback((asset: MediaLibrary.Asset): void => {
    if (selectedIds.size === 0) {
      successHaptic();
      void attachAssetsAsScreenshots([asset]);
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.has(asset.id) ? next.delete(asset.id) : next.add(asset.id);
        return next;
      });
    }
  }, [selectedIds.size, attachAssetsAsScreenshots]);

  const handleRecentLongPress = useCallback((asset: MediaLibrary.Asset): void => {
    tapHaptic();
    setSelectedIds((prev) => new Set([...prev, asset.id]));
  }, []);

  const handleAddSelected = useCallback((): void => {
    const selected = recentAssets.filter((a) => selectedIds.has(a.id));
    if (selected.length === 0) return;
    successHaptic();
    setSelectedIds(new Set());
    void attachAssetsAsScreenshots(selected);
  }, [recentAssets, selectedIds, attachAssetsAsScreenshots]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!formValid || submitting) return;
    setSubmitting(true);
    setResult(null);
    let preparedScreenshots: FeedbackScreenshot[] | undefined;
    if (screenshots.length > 0) {
      try {
        preparedScreenshots = await prepareFeedbackScreenshots(screenshots.map((s) => s.uri));
      } catch {
        setResult({ ok: false, code: 'validation', message: t('feedback.screenshotError') });
        setSubmitting(false);
        return;
      }
    }
    const res = await submitFeedback({
      kind,
      title: trimmedTitle,
      body: trimmedBody,
      contact: contact.trim() ? contact.trim() : undefined,
      diagnostics: includeDiagnostics ? diagnostics : undefined,
      screenshots: preparedScreenshots,
      recentLogs: includeLogs ? getRecentLogs() : undefined,
      clientNonce: nonceRef.current,
    });
    setResult(res);
    setSubmitting(false);
    if (res.ok && lastCrash) void dismissCrash();
  }, [formValid, submitting, kind, trimmedTitle, trimmedBody, contact, includeDiagnostics, diagnostics, includeLogs, screenshots, lastCrash, dismissCrash, t]);

  const handleCopyFallback = useCallback(async (): Promise<void> => {
    const md = renderClipboardFallback({
      kind,
      title: trimmedTitle,
      body: trimmedBody,
      contact: contact.trim(),
      diagnostics: includeDiagnostics ? diagnosticsPreview : null,
      hasScreenshots: screenshots.length > 0,
    });
    await Clipboard.setStringAsync(md);
    Alert.alert(t('feedback.copySuccessTitle'), t('feedback.copySuccessBody'));
  }, [kind, trimmedTitle, trimmedBody, contact, includeDiagnostics, diagnosticsPreview, screenshots.length, t]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
      accessibilityViewIsModal={true}
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
            accessibilityLabel={result?.ok ? t('feedback.closeLabel') : t('feedback.cancelLabel')}
            accessibilityRole="button"
          >
            <ArrowLeft size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {result?.ok ? t('feedback.titleThanks') : t('feedback.titleSend')}
          </Text>
          <View style={styles.headerIconBtn} />
        </View>

        {result?.ok ? (
          <FeedbackSuccessView issueNumber={result.issueNumber} onClose={onClose} />
        ) : (
          <>
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Service unavailable warning */}
              {!proxyConfigured ? (
                <View style={[styles.warnCard, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}40` }]}>
                  <AlertCircle size={16} color={colors.warningText} style={{ marginTop: 1 }} />
                  <View style={styles.flex}>
                    <Text style={{ color: colors.warningText, fontSize: FontSize.sm, fontWeight: '600' }}>
                      {t('feedback.serviceUnavailableTitle')}
                    </Text>
                    <Text style={{ color: colors.warningText, fontSize: FontSize.xs, marginTop: 2 }}>
                      {t('feedback.serviceUnavailableBody')}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Crash recovery banner */}
              {lastCrash ? (
                <View style={[styles.warnCard, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}40` }]}>
                  <AlertCircle size={16} color={colors.warningText} style={{ marginTop: 1 }} />
                  <View style={styles.flex}>
                    <Text style={{ color: colors.warningText, fontSize: FontSize.sm, fontWeight: '600' }}>
                      {t('feedback.crashDetectedTitle')}
                    </Text>
                    <Text style={{ color: colors.warningText, fontSize: FontSize.xs, marginTop: 2 }}>
                      {t('feedback.crashDetectedBody', { name: lastCrash.name })}
                    </Text>
                    <Pressable
                      onPress={() => void dismissCrash()}
                      style={({ pressed }) => [{ marginTop: 6, opacity: pressed ? 0.6 : 1 }]}
                      accessibilityLabel={t('feedback.crashDismiss')}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: colors.warningText, fontSize: FontSize.xs, textDecorationLine: 'underline' }}>
                        {t('feedback.crashDismiss')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <FeedbackFormBody
                kind={kind}
                title={title}
                body={body}
                contact={contact}
                onKindChange={setKind}
                onTitleChange={setTitle}
                onBodyChange={setBody}
                onContactChange={setContact}
                trimmedTitle={trimmedTitle}
                trimmedBody={trimmedBody}
              />

              <FeedbackScreenshotRail
                screenshots={screenshots}
                recentAssets={recentAssets}
                selectedIds={selectedIds}
                permissionStatus={permissionStatus}
                multiBarStyle={multiBarStyle}
                onAddFromLibrary={() => { void addScreenshotFromLibrary(); }}
                onRequestPermission={() => { void requestPermission(); }}
                onRecentPress={handleRecentPress}
                onRecentLongPress={handleRecentLongPress}
                onAddSelected={handleAddSelected}
                onRemoveScreenshot={(id) => setScreenshots((prev) => prev.filter((s) => s.id !== id))}
              />

              <FeedbackDiagnosticsRow
                includeDiagnostics={includeDiagnostics}
                onToggleInclude={() => setIncludeDiagnostics((v) => !v)}
                showPreview={showDiagnostics}
                onTogglePreview={() => setShowDiagnostics((v) => !v)}
                previewText={diagnosticsPreview}
              />

              <FeedbackLogsRow
                includeLogs={includeLogs}
                onToggleInclude={() => setIncludeLogs((v) => !v)}
                showPreview={showLogsPreview}
                onTogglePreview={() => setShowLogsPreview((v) => !v)}
              />

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
                      {errorTitle(result.code, t)}
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
                    accessibilityRole="button"
                    accessibilityLabel={t('feedback.copyToClipboard')}
                    accessibilityState={{ disabled: !formValid || submitting }}
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
                      {t('feedback.copyToClipboard')}
                    </Text>
                    <ChevronRight size={13} color={formValid ? colors.foreground : colors.mutedForeground} />
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => { void handleSubmit(); }}
                    disabled={!formValid || submitting}
                    accessibilityRole="button"
                    accessibilityLabel={submitting ? t('feedback.sending') : t('feedback.send')}
                    accessibilityState={{ disabled: !formValid || submitting, busy: submitting }}
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
                      {submitting ? t('feedback.sending') : t('feedback.send')}
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
});
