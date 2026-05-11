/**
 * Subtle demo-mode indicator rendered at the top of the chat screen when the
 * user is in the offline demo profile. Shows a pill label and a one-tap
 * "Connect your server" shortcut that opens the Add Server sheet.
 *
 * When the user successfully adds a real server the banner wires up the full
 * transition: disable demo profile → connect to new server.
 */

import React, { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlaskConical } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '@/contexts/ThemeContext';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useConnection } from '@/contexts/ConnectionContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { isDemoProfile } from '@/types';
import { AddServerSheet, type AddServerSheetRef } from '@/components/settings/AddServerSheet';

export function DemoModeBanner(): React.JSX.Element | null {
  const { colors } = useThemeContext();
  const { t } = useTranslation();
  const { activeProfile, disableDemoProfile, getAuthTokenForProfile } = useServerConfig();
  const { connect } = useConnection();
  const sheetRef = useRef<AddServerSheetRef>(null);

  // After the user saves a real server:
  //   1. Remove the demo profile (addProfile already made the new one active).
  //   2. Connect to the new server immediately rather than waiting for cold start.
  const handleAfterSave = useCallback(
    async (profile: { id: string; url: string }): Promise<void> => {
      await disableDemoProfile();
      const token = await getAuthTokenForProfile(profile.id);
      if (token) {
        connect(profile.url, token);
      }
    },
    [disableDemoProfile, getAuthTokenForProfile, connect],
  );

  // Only visible in demo mode — early return AFTER all hooks.
  if (!isDemoProfile(activeProfile)) {
    return null;
  }

  return (
    <>
      <View style={[styles.banner, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <View
          style={styles.labelRow}
          accessible={true}
          accessibilityRole="text"
          accessibilityLabel={t('onboarding.demo.bannerLabel')}
        >
          <FlaskConical size={13} color={colors.mutedForeground} />
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            {t('onboarding.demo.bannerLabel')}
          </Text>
        </View>
        <Pressable
          onPress={() => sheetRef.current?.presentNew()}
          style={({ pressed }) => [
            styles.connectBtn,
            { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
          accessibilityLabel={t('onboarding.demo.connectServer')}
          accessibilityRole="button"
        >
          <Text style={[styles.connectText, { color: colors.foreground }]}>
            {t('onboarding.demo.connectServer')}
          </Text>
        </Pressable>
      </View>

      <AddServerSheet ref={sheetRef} onAfterSave={(p) => { void handleAfterSave(p); }} />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  connectBtn: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  connectText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
