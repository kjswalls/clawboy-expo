import React, { useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTokens } from '@/hooks/useTokens';
import type { ThemeColors } from '@/types';
import { FeedbackSheet } from '../FeedbackSheet';
import { APP_VERSION } from '@/lib/appMeta';
import { createPanelStyles } from './panelStyles';
import { emitFooterLinkTapped } from '@/badges/events';

type FooterProps = {
  colors: ThemeColors;
};

export function SettingsFooter({ colors }: FooterProps): React.JSX.Element {
  const { t } = useTranslation();
  const tk = useTokens();
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const styles = useMemo(() => createPanelStyles(tk), [tk]);
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <View style={styles.footer}>
      <Pressable
        onPress={() => setShowFeedback(true)}
        style={({ pressed }) => [
          styles.bugBtn,
          { borderColor: `${colors.foreground}30` },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('settings.footer.reportBug')}
      >
        <Text style={{ color: colors.foreground, fontSize: tk.fs.xs, fontWeight: '500' }}>
          {t('settings.footer.reportBug')}
        </Text>
      </Pressable>
      <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 8 }}>
        ClawBoy v{APP_VERSION}
      </Text>
      <Pressable
        onPress={() => { emitFooterLinkTapped(); Linking.openURL('https://sundaysoftworks.com'); }}
        accessibilityRole="link"
        accessibilityLabel="Sunday Softworks website"
        style={({ pressed }) => ({ marginTop: 2, borderBottomWidth: 2, borderBottomColor: colors.accent, opacity: pressed ? 0.7 : 1, alignSelf: 'center' })}
      >
        <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs }}>
          {t('settings.footer.builtWith')}
        </Text>
      </Pressable>

      <FeedbackSheet visible={showFeedback} onClose={() => setShowFeedback(false)} />
    </View>
  );
}
