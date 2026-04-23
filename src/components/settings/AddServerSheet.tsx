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
  ArrowLeft,
  ChevronRight,
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

import { useGatewayConnectionTest } from '@/hooks/useGatewayConnectionTest';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useTheme } from '@/hooks/useTheme';
import { clearDeviceIdentity, getOrCreateDeviceIdentity } from '@/lib/device-identity';
import { errorMessageForGatewayTest } from '@/utils/gatewayTestErrors';
import { createBannerMarkdownStyles } from '@/utils/markdownTheme';
import { truncateMiddle } from '@/utils/gatewayUrl';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ServerProfile } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AddServerSheetRef = {
  presentNew: () => void;
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

function isTailnetAddress(address: string): boolean {
  const a = address.toLowerCase();
  return a.includes('.ts.net') || a.includes('tailscale') || a.endsWith('.tail');
}

// ── Component ──────────────────────────────────────────────────────────────────

export const AddServerSheet = forwardRef<AddServerSheetRef, Props>(
  function AddServerSheet({ onAfterSave }, ref) {
    const { colors } = useTheme();
    const { addProfile, updateProfile, getAuthTokenForProfile } = useServerConfig();
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

    // True when the port was auto-set by tailnet detection (not manually typed).
    const portAutoSetRef = useRef(false);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

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

    const resetForm = useCallback((profile?: ServerProfile): void => {
      portAutoSetRef.current = false;
      if (profile) {
        const parsed = parseWsUrl(profile.url);
        setName(profile.name);
        setAddress(parsed.address);
        setPort(parsed.port);
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
      resetTest();
      setDeviceId(null);
    }, [resetTest]);

    useImperativeHandle(ref, () => ({
      presentNew: () => {
        setEditingProfile(null);
        resetForm();
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
          setSaveError('Failed to save server profile. Please try again.');
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

    // ── Actions ───────────────────────────────────────────────────────────────

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
      resetTest();
    }, [resetTest]);

    const isDirtyRef = useRef(false);
    isDirtyRef.current = isDirty;

    const handleDismiss = useCallback((): void => {
      if (isDirtyRef.current) {
        Alert.alert(
          'Discard changes?',
          'You have unsaved changes. Go back and lose them?',
          [
            { text: 'Keep editing', style: 'cancel' },
            {
              text: 'Discard',
              style: 'destructive',
              onPress: () => { resetTest(); initialValuesRef.current = null; setVisible(false); },
            },
          ]
        );
        return;
      }
      resetTest();
      setVisible(false);
    }, [resetTest]);

    const handleConnect = useCallback((): void => {
      const errors: FieldErrors = {};
      if (!name.trim()) errors.name = true;
      if (!address.trim()) errors.address = true;
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setError('Please fill in the required fields above');
        return;
      }
      setFieldErrors({});
      setError(null);
      setSaveError(null);
      startTest(buildWsUrl(address, port), authValue);
    }, [address, authValue, name, port, startTest]);

    const handleForgetDevice = useCallback((): void => {
      Alert.alert(
        'Forget this device',
        'Clears the device keypair. You will need to re-approve this device on the gateway.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Forget',
            style: 'destructive',
            onPress: () => {
              void clearDeviceIdentity();
              setDeviceId(null);
            },
          },
        ]
      );
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
              accessibilityLabel="Go back"
            >
              <ArrowLeft size={18} color={colors.mutedForeground} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              {editingProfile ? 'Edit Connection' : 'New Connection'}
            </Text>
            <Pressable
              onPress={handleClear}
              style={({ pressed }) => [
                styles.clearBtn,
                { borderColor: `${colors.foreground}40` },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={{ color: colors.foreground, fontSize: FontSize.xs, fontWeight: '500' }}>
                Clear
              </Text>
            </Pressable>
          </View>

          {/* Scrollable form body */}
          <ScrollView
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
                    >
                      <View style={styles.flex}>
                        <Text style={{ color: colors.mutedForeground, fontSize: FontSize.xs, fontWeight: '500', marginBottom: 2 }}>
                          Device ID
                        </Text>
                        <Text
                          style={{ color: colors.foreground, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
                          numberOfLines={1}
                        >
                          {truncateMiddle(deviceId, 36)}
                        </Text>
                      </View>
                      <Text style={{ color: colors.primary, fontSize: FontSize.xs, flexShrink: 0 }}>
                        Copy
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : null}

            {/* Connection section */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Connection</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Server Name */}
              <View style={styles.fieldRow}>
                <View style={styles.fieldHeader}>
                  <Text style={[styles.fieldLabel, { color: fieldErrors.name ? colors.destructive : colors.foreground }]}>
                    Server Name
                  </Text>
                  <Text style={{ fontSize: FontSize.xs, color: fieldErrors.name ? colors.destructive : colors.mutedForeground }}>
                    Required
                  </Text>
                </View>
                <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                  A friendly name to identify this connection
                </Text>
                <TextInput
                  value={name}
                  onChangeText={(t) => {
                    setName(t);
                    if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: false }));
                  }}
                  placeholder="e.g. Home Server, Cloud GPU"
                  placeholderTextColor={`${colors.mutedForeground}80`}
                  autoCapitalize="words"
                  autoCorrect={false}
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
                    Server Address
                  </Text>
                  <Text style={{ fontSize: FontSize.xs, color: fieldErrors.address ? colors.destructive : colors.mutedForeground }}>
                    Required
                  </Text>
                </View>
                <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                  Hostname, IP, or paste a full URL — the protocol is stripped automatically
                </Text>
                <TextInput
                  value={address}
                  onChangeText={(t) => {
                    setAddress(t);
                    resetTest();
                    if (fieldErrors.address) setFieldErrors((p) => ({ ...p, address: false }));
                  }}
                  onBlur={() => {
                    const cleaned = stripAddressProtocol(address);
                    setAddress(cleaned);
                    const tailnet = isTailnetAddress(cleaned);
                    if (tailnet && (port === '18789' || portAutoSetRef.current)) {
                      portAutoSetRef.current = true;
                      setPort('443');
                    } else if (!tailnet && portAutoSetRef.current) {
                      portAutoSetRef.current = false;
                      setPort('18789');
                    }
                  }}
                  placeholder="192.168.1.100 or server.example.com"
                  placeholderTextColor={`${colors.mutedForeground}80`}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
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
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Port</Text>
                  <Text style={{ fontSize: FontSize.xs, color: colors.mutedForeground }}>Default: 18789</Text>
                </View>
                <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>Server port number</Text>
                <TextInput
                  value={port}
                  onChangeText={(t) => { portAutoSetRef.current = false; setPort(t); resetTest(); }}
                  placeholder="18789"
                  placeholderTextColor={`${colors.mutedForeground}80`}
                  keyboardType="number-pad"
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
                    Tailnet URL Detected
                  </Text>
                  <Markdown style={createBannerMarkdownStyles(colors.warningText, FontSize.xs)}>
                    {"Make sure Tailscale is running and you're signed in. Use the gateway's actual port (`18789` by default, or `443` if fronted by `tailscale serve`)."}
                  </Markdown>
                </View>
              </View>
            ) : null}

            {/* Authentication section */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Authentication</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Method toggle */}
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: colors.foreground, marginBottom: Spacing.sm }]}>
                  Method
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
                    >
                      {m === 'token'
                        ? <Key size={14} color={authMethod === m ? colors.primary : colors.mutedForeground} />
                        : <Lock size={14} color={authMethod === m ? colors.primary : colors.mutedForeground} />}
                      <Text style={{
                        fontSize: FontSize.sm,
                        fontWeight: '500',
                        color: authMethod === m ? colors.primary : colors.mutedForeground,
                      }}>
                        {m === 'token' ? 'Token' : 'Password'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Auth value */}
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                  {authMethod === 'token' ? 'Auth Token' : 'Password'}
                </Text>
                <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                  {authMethod === 'token' ? 'Stored securely on this device' : 'Encrypted and stored locally'}
                </Text>
                <TextInput
                  value={authValue}
                  onChangeText={(t) => { setAuthValue(t); resetTest(); }}
                  placeholder={authMethod === 'token' ? 'your-auth-token' : 'Enter password'}
                  placeholderTextColor={`${colors.mutedForeground}80`}
                  secureTextEntry={secureAuth}
                  onFocus={() => setSecureAuth(false)}
                  onBlur={() => setSecureAuth(true)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="none"
                  style={[styles.fieldInput, styles.mono, {
                    backgroundColor: colors.secondary,
                    borderColor: 'transparent',
                    color: colors.foreground,
                  }]}
                />
              </View>
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
            {displayError ? (
              <View style={[styles.footerError, { backgroundColor: `${colors.destructive}10`, borderColor: `${colors.destructive}28` }]}>
                <AlertCircle size={15} color={colors.destructive} style={{ flexShrink: 0, marginTop: 1 }} />
                <View style={styles.flex}>
                  <Text style={{ color: colors.destructive, fontSize: FontSize.xs, fontWeight: '600' }}>
                    Connection Failed
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
                  onPress={handleForgetDevice}
                  style={({ pressed }) => [styles.trashBtn, pressed && { opacity: 0.7 }]}
                  accessibilityLabel="Forget this device"
                >
                  <Trash2 size={16} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={handleConnect}
                disabled={isConnecting}
                style={({ pressed }) => [
                  styles.connectBtn,
                  { backgroundColor: btnBg, borderColor: btnBorderColor },
                  pressed && { opacity: 0.82 },
                ]}
              >
                {isConnecting ? (
                  <Animated.View style={spinStyle}>
                    <Loader2 size={14} color={colors.mutedForeground} />
                  </Animated.View>
                ) : null}
                <Text style={{ color: btnText, fontSize: FontSize.xs, fontWeight: '500' }}>
                  {isConnecting ? 'Testing…' : editingProfile ? 'Save Changes' : 'Connect Server'}
                </Text>
                {!isConnecting ? <ChevronRight size={13} color={btnText} /> : null}
              </Pressable>
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
});
