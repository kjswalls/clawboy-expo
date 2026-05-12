import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
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
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Key,
  Loader2,
  Lock,
  Server,
  Trash2,
  Wifi,
} from 'lucide-react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import Markdown from '@ronradtke/react-native-markdown-display';

import { useTranslation } from 'react-i18next';

import { useGatewayConnectionTest } from '@/hooks/useGatewayConnectionTest';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useTheme } from '@/hooks/useTheme';
import { clearDeviceIdentity, getOrCreateDeviceIdentity } from '@/lib/device-identity';
import { errorMessageForGatewayTest } from '@/utils/gatewayTestErrors';
import { createBannerMarkdownStyles } from '@/utils/markdownTheme';
import { isTailnetAddress, truncateMiddle } from '@/utils/gatewayUrl';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ServerProfile } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AddServerSheetRef = {
  /** Open the sheet in new-profile mode, optionally pre-filling URL and name. */
  presentNew: (initial?: { url?: string; name?: string }) => void;
  presentEdit: (profile: ServerProfile) => void;
  dismiss: () => void;
};

type AuthMethod = 'token' | 'password';
type FieldErrors = { name?: boolean; address?: boolean };

type Props = {
  onAfterSave?: (profile: { id: string; url: string }) => void;
};

// ── URL helpers ────────────────────────────────────────────────────────────────

function parseWsUrl(wsUrl: string): { address: string; port: string } {
  const withoutProto = stripAddressProtocol(wsUrl);
  const portMatch = withoutProto.match(/^(.+):(\d+)(\/.*)?$/);
  if (portMatch) {
    return { address: portMatch[1]!, port: portMatch[2]! };
  }
  return { address: withoutProto, port: '18789' };
}

/** Strip any scheme prefix so users can safely paste a full URL into the address field. */
function stripAddressProtocol(raw: string): string {
  return raw.trim().replace(/^(wss?|https?):\/\//i, '');
}

function buildWsUrl(address: string, port: string): string {
  const p = port.trim() || '18789';
  return `wss://${stripAddressProtocol(address)}:${p}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const AddServerSheet = forwardRef<AddServerSheetRef, Props>(
  function AddServerSheet({ onAfterSave }, ref) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const { addProfile, updateProfile, getAuthTokenForProfile, removeProfile } = useServerConfig();
    const { result, startTest, reset: resetTest } = useGatewayConnectionTest();
    const insets = useSafeAreaInsets();

    const [visible, setVisible] = useState(false);
    const [editingProfile, setEditingProfile] = useState<ServerProfile | null>(null);
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [port, setPort] = useState('18789');
    const [authMethod, setAuthMethod] = useState<AuthMethod>('token');
    const [authValue, setAuthValue] = useState('');
    const [secureAuth, setSecureAuth] = useState(true);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [error, setError] = useState<string | null>(null);
    // True when the user pasted a ws:// or http:// URL — we silently upgrade to wss://
    // but still surface a security notice per .cursorrules security rule #2.
    const [insecureWarn, setInsecureWarn] = useState(false);

    // True when the port was auto-set by tailnet detection (not manually typed).
    const portAutoSetRef = useRef(false);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [tokenHelpOpen, setTokenHelpOpen] = useState(false);
    const scrollRef = useRef<ScrollView>(null);
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

    const TOKEN_LOOKUP_CMDS = [
      `jq -r '.gateway.auth.token' ~/.openclaw/openclaw.json`,
      `grep '^OPENCLAW_GATEWAY_TOKEN=' ~/.openclaw/.env | cut -d= -f2-`,
    ] as const;

    // True when the current in-flight test was triggered by "Test" (not "Connect/Save").
    const testOnlyRef = useRef(false);

    // Track the initial values when entering edit mode so we can detect dirty state.
    const initialValuesRef = useRef<{ name: string; address: string; port: string; authValue: string } | null>(null);
    const isDirty = editingProfile !== null && initialValuesRef.current !== null && (
      name !== initialValuesRef.current.name ||
      address !== initialValuesRef.current.address ||
      port !== initialValuesRef.current.port ||
      authValue !== initialValuesRef.current.authValue
    );

    // Stale-closure-safe refs for the save effect.
    const nameRef = useRef(name);
    const addressRef = useRef(address);
    const portRef = useRef(port);
    const authValueRef = useRef(authValue);
    const editingProfileRef = useRef(editingProfile);
    useEffect(() => { nameRef.current = name; }, [name]);
    useEffect(() => { addressRef.current = address; }, [address]);
    useEffect(() => { portRef.current = port; }, [port]);
    useEffect(() => { authValueRef.current = authValue; }, [authValue]);
    useEffect(() => { editingProfileRef.current = editingProfile; }, [editingProfile]);

    const isConnecting = result.kind === 'testing';
    const hasFieldErrors = Boolean(fieldErrors.name ?? fieldErrors.address);

    // Spinner animation
    const spin = useSharedValue(0);
    useEffect(() => {
      if (isConnecting) {
        spin.value = 0;
        spin.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
      } else {
        spin.value = 0;
      }
    }, [isConnecting, spin]);
    const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

    // ── Imperative handle ──────────────────────────────────────────────────────

    const resetForm = useCallback(
      (profile?: ServerProfile, initial?: { url?: string; name?: string }): void => {
        portAutoSetRef.current = false;
        if (profile) {
          const parsed = parseWsUrl(profile.url);
          setName(profile.name);
          setAddress(parsed.address);
          setPort(parsed.port);
        } else if (initial) {
          const parsed = initial.url ? parseWsUrl(initial.url) : { address: '', port: '18789' };
          setName(initial.name ?? '');
          setAddress(parsed.address);
          setPort(parsed.port);
          initialValuesRef.current = null;
        } else {
          setName('');
          setAddress('');
          setPort('18789');
          initialValuesRef.current = null;
        }
        setAuthMethod('token');
        setAuthValue('');
        setSecureAuth(true);
        setFieldErrors({});
        setError(null);
        setSaveError(null);
        setInsecureWarn(false);
        resetTest();
        setDeviceId(null);
      },
      [resetTest]
    );

    useImperativeHandle(ref, () => ({
      presentNew: (initial?: { url?: string; name?: string }) => {
        setEditingProfile(null);
        resetForm(undefined, initial);
        setVisible(true);
      },
      presentEdit: (profile: ServerProfile) => {
        setEditingProfile(profile);
        resetForm(profile);
        // Snapshot initial values for dirty-checking. Token loaded async below.
        const parsed = parseWsUrl(profile.url);
        initialValuesRef.current = { name: profile.name, address: parsed.address, port: parsed.port, authValue: '' };
        void getAuthTokenForProfile(profile.id).then((t) => {
          const token = t ?? '';
          setAuthValue(token);
          // Update snapshot once the token is known.
          if (initialValuesRef.current) {
            initialValuesRef.current = { ...initialValuesRef.current, authValue: token };
          }
        });
        void getOrCreateDeviceIdentity().then((i) => setDeviceId(i?.id ?? null));
        setVisible(true);
      },
      dismiss: () => setVisible(false),
    }), [getAuthTokenForProfile, resetForm]);

    // ── Save on test success ───────────────────────────────────────────────────

    useEffect(() => {
      if (result.kind !== 'success') return;
      // Test-only run: just show the success banner, don't save or close.
      if (testOnlyRef.current) return;
      const wsUrl = buildWsUrl(addressRef.current, portRef.current);
      const ep = editingProfileRef.current;
      void (async () => {
        try {
          let saved: { id: string; url: string };
          if (ep) {
            await updateProfile(ep.id, {
              name: nameRef.current.trim() || ep.name,
              url: wsUrl,
              authToken: authValueRef.current,
            });
            saved = { id: ep.id, url: wsUrl };
          } else {
            const resolvedName = nameRef.current.trim() || addressRef.current.trim() || 'server';
            saved = await addProfile({
              name: resolvedName,
              url: wsUrl,
              isActive: true,
              authToken: authValueRef.current,
            });
          }
          initialValuesRef.current = null;
          resetTest();
          setVisible(false);
          onAfterSave?.(saved);
        } catch {
          setSaveError(t('settings.addServer.saveError'));
        } finally {
          setAuthValue('');
          authValueRef.current = '';
        }
      })();
    // Only trigger when test result changes to 'success'.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result.kind]);

    useEffect(() => {
      if (result.kind === 'error') {
        setError(errorMessageForGatewayTest(result.state));
      }
    }, [result]);

    useEffect(() => {
      if (!tokenHelpOpen) return;
      const t = setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 80);
      return () => clearTimeout(t);
    }, [tokenHelpOpen]);

    // ── Actions ───────────────────────────────────────────────────────────────

    const reconcileTailnetPort = useCallback((next: string): void => {
      const tailnet = isTailnetAddress(next);
      if (tailnet && (port === '18789' || portAutoSetRef.current)) {
        portAutoSetRef.current = true;
        setPort('443');
      } else if (!tailnet && portAutoSetRef.current) {
        portAutoSetRef.current = false;
        setPort('18789');
      }
    }, [port]);

    const handleClear = useCallback((): void => {
      portAutoSetRef.current = false;
      setName('');
      setAddress('');
      setPort('18789');
      setAuthMethod('token');
      setAuthValue('');
      setFieldErrors({});
      setError(null);
      setSaveError(null);
      setInsecureWarn(false);
      resetTest();
    }, [resetTest]);

    const isDirtyRef = useRef(false);
    isDirtyRef.current = isDirty;

    const handleDismiss = useCallback((): void => {
      if (isDirtyRef.current) {
        Alert.alert(
          t('settings.addServer.discardTitle'),
          t('settings.addServer.discardBody'),
          [
            { text: t('settings.addServer.keepEditing'), style: 'cancel' },
            {
              text: t('settings.addServer.discardBtn'),
              style: 'destructive',
              onPress: () => {
                resetTest();
                initialValuesRef.current = null;
                setAuthValue('');
                authValueRef.current = '';
                setVisible(false);
              },
            },
          ]
        );
        return;
      }
      resetTest();
      setAuthValue('');
      authValueRef.current = '';
      setVisible(false);
    }, [t, resetTest]);

    const handleConnect = useCallback((): void => {
      const errors: FieldErrors = {};
      if (!name.trim()) errors.name = true;
      if (!address.trim()) errors.address = true;
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setError(t('settings.addServer.requiredFieldsError'));
        return;
      }
      setFieldErrors({});
      setError(null);
      setSaveError(null);
      testOnlyRef.current = false;
      startTest(buildWsUrl(address, port), authValue);
    }, [address, authValue, name, port, startTest, t]);

    const handleTestOnly = useCallback((): void => {
      const errors: FieldErrors = {};
      if (!name.trim()) errors.name = true;
      if (!address.trim()) errors.address = true;
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setError(t('settings.addServer.requiredFieldsError'));
        return;
      }
      setFieldErrors({});
      setError(null);
      setSaveError(null);
      testOnlyRef.current = true;
      startTest(buildWsUrl(address, port), authValue);
    }, [address, authValue, name, port, startTest, t]);

    const handleDeleteProfile = useCallback((): void => {
      const profile = editingProfile;
      if (!profile) return;
      Alert.alert(
        t('settings.server.removeAlertTitle'),
        t('settings.server.removeAlertBody', { name: profile.name }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('settings.server.removeBtn'),
            style: 'destructive',
            onPress: () => {
              void removeProfile(profile.id).then(() => {
                initialValuesRef.current = null;
                resetTest();
                setVisible(false);
              });
            },
          },
        ]
      );
    }, [editingProfile, removeProfile, resetTest, t]);

    const handleResetDeviceIdentity = useCallback((): void => {
      Alert.alert(
        t('settings.addServer.forgetDevice'),
        t('settings.addServer.forgetDeviceBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('settings.addServer.forgetBtn'),
            style: 'destructive',
            onPress: () => {
              void clearDeviceIdentity();
              setDeviceId(null);
            },
          },
        ]
      );
    }, [t]);

    const handleCopyCmd = useCallback(async (idx: number, cmd: string): Promise<void> => {
      await Clipboard.setStringAsync(cmd);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 2000);
    }, []);

    // ── Derived ───────────────────────────────────────────────────────────────

    const isTailnet = isTailnetAddress(address);
    const canConnect = Boolean(name.trim() && address.trim()) && !isConnecting;
    const displayError = saveError ?? error;

    // "Save Changes" button is highlighted (prominent border) when the form is dirty.
    const btnBg = hasFieldErrors
      ? `${colors.destructive}18`
      : !canConnect
        ? colors.muted
        : colors.secondary;
    const btnBorderColor = hasFieldErrors
      ? colors.destructive
      : isDirty
        ? colors.foreground
        : colors.border;
    const btnText = hasFieldErrors
      ? colors.destructive
      : canConnect
        ? colors.foreground
        : colors.mutedForeground;

    // ── Render ────────────────────────────────────────────────────────────────

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
              style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.7 }]}
              accessibilityLabel={t('settings.addServer.goBack')}
            >
              <ArrowLeft size={18} color={colors.mutedForeground} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              {editingProfile ? t('settings.addServer.titleEdit') : t('settings.addServer.titleNew')}
            </Text>
            <Pressable
              onPress={handleClear}
              style={({ pressed }) => [
                styles.clearBtn,
                { borderColor: `${colors.foreground}40` },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel={t('settings.addServer.clearBtn')}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.foreground, fontSize: FontSize.xs, fontWeight: '500' }}>
                {t('settings.addServer.clearBtn')}
              </Text>
            </Pressable>
          </View>

          {/* Scrollable form body */}
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Edit mode: server info card (name + URL + optional device ID) */}
            {editingProfile ? (
              <View style={[styles.serverCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Server identity row */}
                <View style={styles.serverRow}>
                  <View style={[styles.serverIcon, { backgroundColor: colors.secondary }]}>
                    <Server size={18} color={colors.mutedForeground} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
                      {editingProfile.name}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs }} numberOfLines={1}>
                      {editingProfile.url}
                    </Text>
                  </View>
                </View>

                {/* Device ID row — only when known */}
                {deviceId ? (
                  <>
                    <View style={[styles.inCardDivider, { backgroundColor: colors.border }]} />
                    <Pressable
                      onPress={() => { void Clipboard.setStringAsync(deviceId); }}
                      style={({ pressed }) => [styles.deviceIdRow, pressed && { opacity: 0.75 }]}
                      accessibilityLabel={t('common.copy')}
                      accessibilityRole="button"
                    >
                      <View style={styles.flex}>
                        <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, fontWeight: '500', marginBottom: 2 }}>
                          {t('settings.addServer.deviceId')}
                        </Text>
                        <Text
                          style={{ color: colors.foreground, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
                          numberOfLines={1}
                        >
                          {truncateMiddle(deviceId, 36)}
                        </Text>
                      </View>
                      <Text style={{ color: colors.primary, fontSize: FontSize.xs, flexShrink: 0 }}>
                        {t('settings.addServer.copy')}
                      </Text>
                    </Pressable>
                    <View style={[styles.inCardDivider, { backgroundColor: colors.border }]} />
                    <Pressable
                      onPress={handleResetDeviceIdentity}
                      style={({ pressed }) => [styles.deviceIdRow, pressed && { opacity: 0.75 }]}
                      accessibilityLabel={t('settings.addServer.forgetDevice')}
                    >
                      <View style={styles.flex}>
                        <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '500' }}>
                          {t('settings.addServer.forgetDevice')}
                        </Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, marginTop: 2 }} numberOfLines={2}>
                          {t('settings.addServer.forgetDeviceBody')}
                        </Text>
                      </View>
                      <Text style={{ color: colors.destructive, fontSize: FontSize.xs, fontWeight: '600', flexShrink: 0 }}>
                        {t('settings.addServer.resetIdentityLabel')}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : null}

            {/* Connection section */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('settings.addServer.sectionConnection')}</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Server Name */}
              <View style={styles.fieldRow}>
                <View style={styles.fieldHeader}>
                  <Text style={[styles.fieldLabel, { color: fieldErrors.name ? colors.destructive : colors.foreground }]}>
                    {t('settings.addServer.fieldServerName')}
                  </Text>
                  <Text style={{ fontSize: FontSize.xs, color: fieldErrors.name ? colors.destructive : colors.mutedForeground }}>
                    {t('settings.addServer.required')}
                  </Text>
                </View>
                <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                  {t('settings.addServer.hintServerName')}
                </Text>
                <TextInput
                  value={name}
                  onChangeText={(v) => {
                    setName(v);
                    resetTest();
                    if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: false }));
                  }}
                  placeholder={t('settings.addServer.placeholderName')}
                  placeholderTextColor={`${colors.mutedForeground}80`}
                  autoCapitalize="words"
                  autoCorrect={false}
                  accessibilityLabel={t('settings.addServer.fieldServerName')}
                  style={[styles.fieldInput, {
                    backgroundColor: colors.secondary,
                    borderColor: fieldErrors.name ? colors.destructive : 'transparent',
                    color: colors.foreground,
                  }]}
                />
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Server Address */}
              <View style={styles.fieldRow}>
                <View style={styles.fieldHeader}>
                  <Text style={[styles.fieldLabel, { color: fieldErrors.address ? colors.destructive : colors.foreground }]}>
                    {t('settings.addServer.fieldServerAddress')}
                  </Text>
                  <Text style={{ fontSize: FontSize.xs, color: fieldErrors.address ? colors.destructive : colors.mutedForeground }}>
                    {t('settings.addServer.required')}
                  </Text>
                </View>
                <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                  {t('settings.addServer.hintServerAddress')}
                </Text>
                <TextInput
                  value={address}
                  onChangeText={(v) => {
                    setAddress(v);
                    setInsecureWarn(false);
                    resetTest();
                    if (fieldErrors.address) setFieldErrors((p) => ({ ...p, address: false }));
                    reconcileTailnetPort(v);
                  }}
                  onBlur={() => {
                    // Detect ws:// or http:// before stripping — we'll always upgrade to
                    // wss:// via buildWsUrl, but surface a security warning to the user.
                    const raw = address.trim();
                    const isInsecure = /^(ws|http):\/\//i.test(raw) && !/^(wss|https):\/\//i.test(raw);
                    setInsecureWarn(isInsecure);
                    const cleaned = stripAddressProtocol(address);
                    setAddress(cleaned);
                    reconcileTailnetPort(cleaned);
                  }}
                  placeholder={t('settings.addServer.placeholderAddress')}
                  placeholderTextColor={`${colors.mutedForeground}80`}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  accessibilityLabel={t('settings.addServer.fieldServerAddress')}
                  style={[styles.fieldInput, styles.mono, {
                    backgroundColor: colors.secondary,
                    borderColor: fieldErrors.address ? colors.destructive : 'transparent',
                    color: colors.foreground,
                  }]}
                />
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Port */}
              <View style={styles.fieldRow}>
                <View style={styles.fieldHeader}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('settings.addServer.fieldPort')}</Text>
                  <Text style={{ fontSize: FontSize.xs, color: colors.mutedForeground }}>{t('settings.addServer.defaultPort')}</Text>
                </View>
                <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>{t('settings.addServer.hintPort')}</Text>
                <TextInput
                  value={port}
                  onChangeText={(v) => { portAutoSetRef.current = false; setPort(v); resetTest(); }}
                  placeholder="18789"
                  placeholderTextColor={`${colors.mutedForeground}80`}
                  keyboardType="number-pad"
                  accessibilityLabel={t('settings.addServer.fieldPort')}
                  style={[styles.fieldInput, styles.mono, {
                    backgroundColor: colors.secondary,
                    borderColor: 'transparent',
                    color: colors.foreground,
                  }]}
                />
              </View>
            </View>

            {/* Tailnet notice */}
            {isTailnet ? (
              <View style={[styles.warningCard, { backgroundColor: `${colors.warning}20`, borderColor: `${colors.warning}50` }]}>
                <View style={[styles.warningIcon, { backgroundColor: `${colors.warning}30` }]}>
                  <Wifi size={16} color={colors.warningText} />
                </View>
                <View style={styles.flex}>
                  <Text style={{ color: colors.warningText, fontSize: FontSize.sm, fontWeight: '600' }}>
                    {t('settings.addServer.tailnetTitle')}
                  </Text>
                  <Markdown style={createBannerMarkdownStyles(colors.warningText, FontSize.xs)}>
                    {t('settings.addServer.tailnetBody')}
                  </Markdown>
                </View>
              </View>
            ) : null}

            {/* Insecure transport warning — shown when user pastes ws:// or http:// */}
            {insecureWarn ? (
              <View style={[styles.warningCard, { backgroundColor: `${colors.destructive}14`, borderColor: `${colors.destructive}40` }]}>
                <View style={[styles.warningIcon, { backgroundColor: `${colors.destructive}20` }]}>
                  <AlertTriangle size={16} color={colors.destructive} />
                </View>
                <View style={styles.flex}>
                  <Text style={{ color: colors.destructive, fontSize: FontSize.sm, fontWeight: '600' }}>
                    {t('settings.addServer.insecureTitle')}
                  </Text>
                  <Markdown style={createBannerMarkdownStyles(colors.destructive, FontSize.xs)}>
                    {t('settings.addServer.insecureBody')}
                  </Markdown>
                </View>
              </View>
            ) : null}

            {/* Authentication section */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('settings.addServer.sectionAuth')}</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Method toggle */}
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: colors.foreground, marginBottom: Spacing.sm }]}>
                  {t('settings.addServer.authMethod')}
                </Text>
                <View style={styles.methodRow}>
                  {(['token', 'password'] as AuthMethod[]).map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => setAuthMethod(m)}
                      style={[
                        styles.methodBtn,
                        authMethod === m
                          ? { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}50` }
                          : { backgroundColor: colors.secondary, borderColor: 'transparent' },
                      ]}
                      accessibilityLabel={m === 'token' ? t('settings.addServer.authToken') : t('settings.addServer.authPassword')}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: authMethod === m }}
                    >
                      {m === 'token'
                        ? <Key size={14} color={authMethod === m ? colors.primary : colors.mutedForeground} />
                        : <Lock size={14} color={authMethod === m ? colors.primary : colors.mutedForeground} />}
                      <Text style={{
                        fontSize: FontSize.sm,
                        fontWeight: '500',
                        color: authMethod === m ? colors.primary : colors.mutedForeground,
                      }}>
                        {m === 'token' ? t('settings.addServer.authToken') : t('settings.addServer.authPassword')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Auth value */}
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                  {authMethod === 'token' ? t('settings.addServer.authTokenLabel') : t('settings.addServer.authPassword')}
                </Text>
                <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                  {authMethod === 'token' ? t('settings.addServer.authTokenHint') : t('settings.addServer.authPasswordHint')}
                </Text>
                <TextInput
                  value={authValue}
                  onChangeText={(v) => { setAuthValue(v); resetTest(); }}
                  placeholder={authMethod === 'token' ? t('settings.addServer.authTokenPlaceholder') : t('settings.addServer.authPasswordPlaceholder')}
                  placeholderTextColor={`${colors.mutedForeground}80`}
                  secureTextEntry={secureAuth}
                  onFocus={() => setSecureAuth(false)}
                  onBlur={() => setSecureAuth(true)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="none"
                  accessibilityLabel={authMethod === 'token' ? t('settings.addServer.authTokenLabel') : t('settings.addServer.authPassword')}
                  style={[styles.fieldInput, styles.mono, {
                    backgroundColor: colors.secondary,
                    borderColor: 'transparent',
                    color: colors.foreground,
                  }]}
                />
              </View>

              {/* Token lookup help — shown only for token auth */}
              {authMethod === 'token' ? (
                <>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <Pressable
                    onPress={() => setTokenHelpOpen((o) => !o)}
                    style={({ pressed }) => [styles.tokenHelpHeader, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('settings.addServer.tokenHelpToggle')}
                    accessibilityState={{ expanded: tokenHelpOpen }}
                  >
                    <Text style={[styles.tokenHelpToggleText, { color: colors.mutedForeground }]}>
                      {t('settings.addServer.tokenHelpToggle')}
                    </Text>
                    <ChevronDown
                      size={14}
                      color={colors.mutedForeground}
                      style={{ transform: [{ rotate: tokenHelpOpen ? '180deg' : '0deg' }] }}
                    />
                  </Pressable>
                  {tokenHelpOpen ? (
                    <View style={[styles.tokenHelpBody, { backgroundColor: colors.secondary }]}>
                      <Text style={[styles.tokenHelpIntro, { color: colors.mutedForeground }]}>
                        {t('settings.addServer.tokenHelpIntro')}
                      </Text>
                      {([
                        { label: 'settings.addServer.tokenHelpLegacyLabel', idx: 0 },
                        { label: 'settings.addServer.tokenHelpDotenvLabel', idx: 1 },
                      ] as const).map(({ label, idx }) => (
                        <View key={idx} style={styles.tokenCmdBlock}>
                          <Text style={[styles.tokenCmdLabel, { color: colors.mutedForeground }]}>
                            {t(label)}
                          </Text>
                          <View style={[styles.tokenCmdRow, { borderColor: `${colors.border}` }]}>
                            <Text style={[styles.mono, styles.tokenCmdText, { color: colors.foreground }]} selectable>
                              {TOKEN_LOOKUP_CMDS[idx]}
                            </Text>
                            <Pressable
                              onPress={() => { void handleCopyCmd(idx, TOKEN_LOOKUP_CMDS[idx]); }}
                              style={({ pressed }) => [
                                styles.tokenCopyBtn,
                                { borderColor: `${colors.foreground}30` },
                                pressed && { opacity: 0.6 },
                              ]}
                              accessibilityLabel={t('common.copy')}
                              accessibilityRole="button"
                            >
                              {copiedIdx === idx
                                ? <Check size={11} color={colors.success} />
                                : <Copy size={11} color={colors.mutedForeground} />}
                              <Text style={[styles.tokenCopyBtnText, {
                                color: copiedIdx === idx ? colors.success : colors.mutedForeground,
                              }]}>
                                {copiedIdx === idx ? t('common.copied') : t('common.copy')}
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>

            <View style={{ height: Spacing.lg }} />
          </ScrollView>

          {/* Pinned footer — error banner (when present) + button row */}
          <View style={[
            styles.footer,
            {
              borderTopColor: colors.border,
              backgroundColor: `${colors.card}E8`,
              paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.sm,
            },
          ]}>
            {result.kind === 'success' && testOnlyRef.current ? (
              <View style={[styles.footerError, { backgroundColor: `${colors.success}10`, borderColor: `${colors.success}30` }]}>
                <Check size={15} color={colors.success} style={{ flexShrink: 0, marginTop: 1 }} />
                <View style={styles.flex}>
                  <Text style={{ color: colors.success, fontSize: FontSize.xs, fontWeight: '600' }}>
                    {t('settings.addServer.testPassedTitle')}
                  </Text>
                  <Text style={{ color: `${colors.success}BB`, fontSize: FontSize.xs, lineHeight: 16, marginTop: 1 }}>
                    {result.mode === 'pairing_required'
                      ? t('settings.addServer.testPassedPairing')
                      : t('settings.addServer.testPassedConnected')}
                  </Text>
                </View>
              </View>
            ) : null}
            {displayError ? (
              <View style={[styles.footerError, { backgroundColor: `${colors.destructive}10`, borderColor: `${colors.destructive}28` }]}>
                <AlertCircle size={15} color={colors.destructive} style={{ flexShrink: 0, marginTop: 1 }} />
                <View style={styles.flex}>
                  <Text style={{ color: colors.destructive, fontSize: FontSize.xs, fontWeight: '600' }}>
                    {t('settings.addServer.connectionFailed')}
                  </Text>
                  <Markdown style={createBannerMarkdownStyles(`${colors.destructive}BB`, FontSize.xs)}>
                    {displayError}
                  </Markdown>
                </View>
              </View>
            ) : null}
            <View style={styles.footerBtnRow}>
              {editingProfile ? (
                <Pressable
                  onPress={handleDeleteProfile}
                  style={({ pressed }) => [styles.trashBtn, pressed && { opacity: 0.7 }]}
                  accessibilityLabel={t('settings.addServer.deleteProfileLabel')}
                  accessibilityRole="button"
                >
                  <Trash2 size={16} color={colors.destructive} />
                </Pressable>
              ) : null}
              <View style={[styles.footerBtnGroup]}>
                <Pressable
                  onPress={handleTestOnly}
                  disabled={isConnecting}
                  style={({ pressed }) => [
                    styles.connectBtn,
                    styles.testBtn,
                    { borderColor: colors.border },
                    pressed && { opacity: 0.82 },
                  ]}
                  accessibilityLabel={isConnecting && testOnlyRef.current ? t('settings.addServer.btnTesting') : t('settings.addServer.btnTest')}
                  accessibilityRole="button"
                >
                  {isConnecting && testOnlyRef.current ? (
                    <Animated.View style={spinStyle}>
                      <Loader2 size={14} color={colors.mutedForeground} />
                    </Animated.View>
                  ) : null}
                  <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, fontWeight: '500' }}>
                    {isConnecting && testOnlyRef.current ? t('settings.addServer.btnTesting') : t('settings.addServer.btnTest')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleConnect}
                  disabled={isConnecting}
                  style={({ pressed }) => [
                    styles.connectBtn,
                    { backgroundColor: btnBg, borderColor: btnBorderColor },
                    pressed && { opacity: 0.82 },
                  ]}
                  accessibilityLabel={isConnecting && !testOnlyRef.current ? t('settings.addServer.btnTesting') : editingProfile ? t('settings.addServer.btnSave') : t('settings.addServer.btnConnect')}
                  accessibilityRole="button"
                >
                  {isConnecting && !testOnlyRef.current ? (
                    <Animated.View style={spinStyle}>
                      <Loader2 size={14} color={colors.mutedForeground} />
                    </Animated.View>
                  ) : null}
                  <Text style={{ color: btnText, fontSize: FontSize.xs, fontWeight: '500' }}>
                    {isConnecting && !testOnlyRef.current ? t('settings.addServer.btnTesting') : editingProfile ? t('settings.addServer.btnSave') : t('settings.addServer.btnConnect')}
                  </Text>
                  {!(isConnecting && !testOnlyRef.current) ? <ChevronRight size={13} color={btnText} /> : null}
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }
);

// ── Styles ─────────────────────────────────────────────────────────────────────

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
  headerIconBtn: { padding: 6, marginLeft: -4 },
  headerTitle: { fontSize: FontSize.sm, fontWeight: '500' },
  clearBtn: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  scrollContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  serverCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
  },
  serverIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inCardDivider: { height: StyleSheet.hairlineWidth },
  deviceIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: '500', marginBottom: 10, marginTop: Spacing.md },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  fieldRow: { paddingHorizontal: 12, paddingVertical: 10 },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '500' },
  fieldHint: { fontSize: FontSize.xs, lineHeight: 16, marginBottom: 6 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: FontSize.sm,
  },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  divider: { height: StyleSheet.hairlineWidth },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: 12,
    marginTop: Spacing.md,
  },
  warningIcon: { width: 32, height: 32, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  methodRow: { flexDirection: 'row', gap: Spacing.sm },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  footer: {
    flexDirection: 'column',
    paddingHorizontal: Spacing.md,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.lg,
  },
  footerError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  footerBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  footerBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  trashBtn: { padding: 6 },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  testBtn: {
    backgroundColor: 'transparent',
  },
  tokenHelpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tokenHelpToggleText: { fontSize: FontSize.xs, fontWeight: '500' },
  tokenHelpBody: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
  },
  tokenHelpIntro: { fontSize: FontSize.xs, lineHeight: 16 },
  tokenCmdBlock: { gap: 4 },
  tokenCmdLabel: { fontSize: 10, fontWeight: '500' },
  tokenCmdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  tokenCmdText: { fontSize: 10, lineHeight: 14, flex: 1 },
  tokenCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexShrink: 0,
  },
  tokenCopyBtnText: { fontSize: 10, fontWeight: '600' },
});
