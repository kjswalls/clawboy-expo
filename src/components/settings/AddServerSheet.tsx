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
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ArrowLeft } from 'lucide-react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from 'react-i18next';

import { useGatewayConnectionTest } from '@/hooks/useGatewayConnectionTest';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useTheme } from '@/hooks/useTheme';
import { clearDeviceIdentity, getOrCreateDeviceIdentity } from '@/lib/device-identity';
import { errorMessageForGatewayTest } from '@/utils/gatewayTestErrors';
import { isTailnetAddress } from '@/utils/gatewayUrl';
import { FontSize, Spacing } from '@/constants/theme';
import type { ServerProfile } from '@/types';
import { parseWsUrl, stripAddressProtocol, buildWsUrl, type AuthMethod } from './addServer/serverUrlHelpers';
import { addServerStyles as s } from './addServer/addServerStyles';
import { ServerInfoCard } from './addServer/ServerInfoCard';
import { ServerConnectionWarnings } from './addServer/ServerConnectionWarnings';
import { ServerAuthSection } from './addServer/ServerAuthSection';
import { AddServerFooter } from './addServer/AddServerFooter';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AddServerSheetRef = {
  presentNew: (initial?: { url?: string; name?: string }) => void;
  presentEdit: (profile: ServerProfile) => void;
  dismiss: () => void;
};

type FieldErrors = { name?: boolean; address?: boolean };

type Props = {
  onAfterSave?: (profile: { id: string; url: string }) => void;
};

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
    const [insecureWarn, setInsecureWarn] = useState(false);

    const portAutoSetRef = useRef(false);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const scrollRef = useRef<ScrollView>(null);

    const testOnlyRef = useRef(false);
    const initialValuesRef = useRef<{ name: string; address: string; port: string; authValue: string } | null>(null);
    const isDirty = editingProfile !== null && initialValuesRef.current !== null && (
      name !== initialValuesRef.current.name ||
      address !== initialValuesRef.current.address ||
      port !== initialValuesRef.current.port ||
      authValue !== initialValuesRef.current.authValue
    );

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
        const parsed = parseWsUrl(profile.url);
        initialValuesRef.current = { name: profile.name, address: parsed.address, port: parsed.port, authValue: '' };
        void getAuthTokenForProfile(profile.id).then((tkn) => {
          const token = tkn ?? '';
          setAuthValue(token);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result.kind]);

    useEffect(() => {
      if (result.kind === 'error') {
        setError(errorMessageForGatewayTest(result.state));
      }
    }, [result]);

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

    const handleHelpExpand = useCallback(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, []);

    // ── Derived ───────────────────────────────────────────────────────────────

    const isTailnet = isTailnetAddress(address);
    const canConnect = Boolean(name.trim() && address.trim()) && !isConnecting;
    const displayError = saveError ?? error;
    const testPassed = result.kind === 'success' && testOnlyRef.current;
    const needsPairing = result.kind === 'success' && result.mode === 'pairing_required';

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
          style={[s.flex, { backgroundColor: colors.background }]}
        >
          <View style={[s.header, { borderBottomColor: colors.border }]}>
            <Pressable
              onPress={handleDismiss}
              style={({ pressed }) => [s.headerIconBtn, pressed && { opacity: 0.7 }]}
              accessibilityLabel={t('settings.addServer.goBack')}
            >
              <ArrowLeft size={18} color={colors.mutedForeground} />
            </Pressable>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>
              {editingProfile ? t('settings.addServer.titleEdit') : t('settings.addServer.titleNew')}
            </Text>
            <Pressable
              onPress={handleClear}
              style={({ pressed }) => [
                s.clearBtn,
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

          <ScrollView
            ref={scrollRef}
            style={s.flex}
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {editingProfile ? (
              <ServerInfoCard
                editingProfile={editingProfile}
                deviceId={deviceId}
                onResetDeviceIdentity={handleResetDeviceIdentity}
                colors={colors}
                t={t}
              />
            ) : null}

            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('settings.addServer.sectionConnection')}</Text>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Server Name */}
              <View style={s.fieldRow}>
                <View style={s.fieldHeader}>
                  <Text style={[s.fieldLabel, { color: fieldErrors.name ? colors.destructive : colors.foreground }]}>
                    {t('settings.addServer.fieldServerName')}
                  </Text>
                  <Text style={{ fontSize: FontSize.xs, color: fieldErrors.name ? colors.destructive : colors.mutedForeground }}>
                    {t('settings.addServer.required')}
                  </Text>
                </View>
                <Text style={[s.fieldHint, { color: colors.mutedForeground }]}>
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
                  style={[s.fieldInput, {
                    backgroundColor: colors.secondary,
                    borderColor: fieldErrors.name ? colors.destructive : 'transparent',
                    color: colors.foreground,
                  }]}
                />
              </View>

              <View style={[s.divider, { backgroundColor: colors.border }]} />

              {/* Server Address */}
              <View style={s.fieldRow}>
                <View style={s.fieldHeader}>
                  <Text style={[s.fieldLabel, { color: fieldErrors.address ? colors.destructive : colors.foreground }]}>
                    {t('settings.addServer.fieldServerAddress')}
                  </Text>
                  <Text style={{ fontSize: FontSize.xs, color: fieldErrors.address ? colors.destructive : colors.mutedForeground }}>
                    {t('settings.addServer.required')}
                  </Text>
                </View>
                <Text style={[s.fieldHint, { color: colors.mutedForeground }]}>
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
                  style={[s.fieldInput, s.mono, {
                    backgroundColor: colors.secondary,
                    borderColor: fieldErrors.address ? colors.destructive : 'transparent',
                    color: colors.foreground,
                  }]}
                />
              </View>

              <View style={[s.divider, { backgroundColor: colors.border }]} />

              {/* Port */}
              <View style={s.fieldRow}>
                <View style={s.fieldHeader}>
                  <Text style={[s.fieldLabel, { color: colors.foreground }]}>{t('settings.addServer.fieldPort')}</Text>
                  <Text style={{ fontSize: FontSize.xs, color: colors.mutedForeground }}>{t('settings.addServer.defaultPort')}</Text>
                </View>
                <Text style={[s.fieldHint, { color: colors.mutedForeground }]}>{t('settings.addServer.hintPort')}</Text>
                <TextInput
                  value={port}
                  onChangeText={(v) => { portAutoSetRef.current = false; setPort(v); resetTest(); }}
                  placeholder="18789"
                  placeholderTextColor={`${colors.mutedForeground}80`}
                  keyboardType="number-pad"
                  accessibilityLabel={t('settings.addServer.fieldPort')}
                  style={[s.fieldInput, s.mono, {
                    backgroundColor: colors.secondary,
                    borderColor: 'transparent',
                    color: colors.foreground,
                  }]}
                />
              </View>
            </View>

            <ServerConnectionWarnings
              isTailnet={isTailnet}
              insecureWarn={insecureWarn}
              colors={colors}
              t={t}
            />

            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('settings.addServer.sectionAuth')}</Text>
            <ServerAuthSection
              authMethod={authMethod}
              onAuthMethodChange={setAuthMethod}
              authValue={authValue}
              onAuthValueChange={setAuthValue}
              secureAuth={secureAuth}
              onSecureAuthChange={setSecureAuth}
              onResetTest={resetTest}
              onHelpExpand={handleHelpExpand}
              colors={colors}
              t={t}
            />

            <View style={{ height: Spacing.lg }} />
          </ScrollView>

          <AddServerFooter
            isTestOnly={testOnlyRef.current}
            isConnecting={isConnecting}
            testPassed={testPassed}
            needsPairing={needsPairing}
            displayError={displayError}
            isEditMode={Boolean(editingProfile)}
            isDirty={isDirty}
            hasFieldErrors={hasFieldErrors}
            canConnect={canConnect}
            bottomInset={insets.bottom}
            onDeleteProfile={handleDeleteProfile}
            onTestOnly={handleTestOnly}
            onConnect={handleConnect}
            spinStyle={spinStyle}
            colors={colors}
            t={t}
          />
        </KeyboardAvoidingView>
      </Modal>
    );
  }
);
