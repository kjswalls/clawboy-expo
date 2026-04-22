import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { Check, Loader2, X } from 'lucide-react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useGatewayConnectionTest } from '@/hooks/useGatewayConnectionTest';
import { useServerConfig } from '@/hooks/useServerConfig';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { analyzeGatewayUrlInput } from '@/utils/gatewayUrl';
import { errorMessageForGatewayTest } from '@/utils/gatewayTestErrors';
import { ConnectionFormFields } from './ConnectionFormFields';

const snapPoints = ['72%'];

export type AddServerSheetRef = { present: () => void; dismiss: () => void };

type Props = { onAfterSave?: (profile: { id: string; url: string }) => void };

export const AddServerSheet = forwardRef<AddServerSheetRef, Props>(function AddServerSheet(
  { onAfterSave },
  ref
) {
  const { colors } = useTheme();
  const { addProfile } = useServerConfig();
  const sheetRef = useRef<BottomSheetModal>(null);
  const { result, startTest, reset: resetTest } = useGatewayConnectionTest();

  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const spin = useSharedValue(0);

  useImperativeHandle(
    ref,
    () => ({
      present: () => {
        setName('');
        setServerUrl('');
        setToken('');
        setShowToken(false);
        resetTest();
        sheetRef.current?.present();
      },
      dismiss: () => {
        sheetRef.current?.dismiss();
      },
    }),
    [resetTest]
  );

  const urlAnalysis = useMemo(() => analyzeGatewayUrlInput(serverUrl), [serverUrl]);
  const isTesting = result.kind === 'testing';
  const canSave =
    result.kind === 'success' && token.trim().length > 0 && urlAnalysis.normalizedWsUrl.length > 0;

  useEffect(() => {
    if (isTesting) {
      spin.value = 0;
      spin.value = withRepeat(
        withTiming(360, { duration: 900, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      spin.value = 0;
    }
  }, [isTesting, spin]);

  const spinStyle = useAnimatedStyle((): { transform: { rotate: string }[] } => {
    return { transform: [{ rotate: `${spin.value}deg` }] };
  });

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
    ),
    []
  );

  const onPressTest = useCallback((): void => {
    if (!urlAnalysis.normalizedWsUrl) {
      return;
    }
    startTest(urlAnalysis.normalizedWsUrl, token);
  }, [startTest, token, urlAnalysis.normalizedWsUrl]);

  const onPressSave = useCallback(async () => {
    if (!canSave) {
      return;
    }
    const hostFromUrl = urlAnalysis.normalizedWsUrl
      .replace(/^wss?:\/\//i, '')
      .split('/')[0] ?? 'server';
    const resolvedName = name.trim() || hostFromUrl || 'server';
    const saved = await addProfile({
      name: resolvedName,
      url: urlAnalysis.normalizedWsUrl,
      isActive: true,
      authToken: token,
    });
    sheetRef.current?.dismiss();
    onAfterSave?.(saved);
  }, [addProfile, canSave, name, onAfterSave, token, urlAnalysis.normalizedWsUrl]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      onDismiss={resetTest}
      backgroundStyle={{ backgroundColor: colors.card }}
      handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
      backdropComponent={renderBackdrop}
      keyboardBehavior="extend"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.cardForeground }]}>Add server</Text>
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          Tokens are stored in SecureStore. Never share your gateway token.
        </Text>

        <ConnectionFormFields
          colors={colors}
          name={name}
          onChangeName={setName}
          showName
          serverUrl={serverUrl}
          onChangeUrl={setServerUrl}
          token={token}
          onChangeToken={setToken}
          showToken={showToken}
          onToggleTokenVisible={() => {
            setShowToken((s) => !s);
          }}
        />

        {(urlAnalysis.isInsecureTransport || urlAnalysis.wasHttpToWs) && serverUrl.trim().length > 0 ? (
          <View style={[styles.warn, { backgroundColor: colors.muted, borderColor: colors.warning }]}>
            <Text style={[styles.warnText, { color: colors.warningForeground }]}>
              {urlAnalysis.wasHttpToWs
                ? '⚠️ Converted http:// to WebSocket. Traffic may be unencrypted (ws://).'
                : '⚠️ Insecure connection — your data will not be encrypted (ws://).'}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={onPressTest}
          disabled={!urlAnalysis.normalizedWsUrl || !token.trim() || isTesting}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.secondary, borderColor: colors.border },
            (!urlAnalysis.normalizedWsUrl || !token.trim() || isTesting) && { opacity: 0.5 },
            pressed && { opacity: 0.9 },
          ]}
        >
          {isTesting ? (
            <View style={styles.testRow}>
              <Animated.View style={spinStyle}>
                <Loader2 size={16} color={colors.primary} />
              </Animated.View>
              <Text style={[styles.btnLabel, { color: colors.cardForeground }]}>Testing…</Text>
            </View>
          ) : (
            <Text style={[styles.btnLabel, { color: colors.cardForeground }]}>Test connection</Text>
          )}
        </Pressable>

        {result.kind === 'success' ? (
          <View style={[styles.outcome, { backgroundColor: colors.muted, borderColor: colors.success }]}>
            {result.mode === 'pairing_required' ? (
              <Text style={{ color: colors.foreground, fontSize: FontSize.sm }}>
                Server reachable — approve this device on the gateway, then you can save.
              </Text>
            ) : (
              <View style={styles.okRow}>
                <Check size={16} color={colors.success} />
                <Text style={{ color: colors.success, fontSize: FontSize.sm, fontWeight: '600' }}>Connected!</Text>
              </View>
            )}
          </View>
        ) : null}

        {result.kind === 'error' ? (
          <View style={[styles.outcome, { backgroundColor: colors.muted, borderColor: colors.destructive }]}>
            <View style={styles.okRow}>
              <X size={16} color={colors.destructive} />
              <Text style={{ color: colors.destructive, fontSize: FontSize.sm, flex: 1 }}>
                {errorMessageForGatewayTest(result.state)}
              </Text>
            </View>
          </View>
        ) : null}

        <Pressable
          onPress={onPressSave}
          disabled={!canSave}
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: canSave ? colors.primary : colors.muted, opacity: canSave ? 1 : 0.45 },
            pressed && canSave && { opacity: 0.9 },
          ]}
        >
          <Text style={[styles.saveLabel, { color: colors.primaryForeground }]}>Save</Text>
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['2xl'],
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  caption: {
    fontSize: FontSize.xs,
    lineHeight: 18,
    marginBottom: Spacing.lg,
  },
  warn: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  warnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  btn: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.lg,
    paddingVertical: 12,
    alignItems: 'center',
  },
  testRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  btnLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  outcome: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  okRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  saveBtn: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
