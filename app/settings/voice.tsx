import React from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsSubScreen } from '@/components/settings/SettingsSubScreen';
import { SettingsTtsSection } from '@/components/settings/SettingsTtsSection';
import { useTheme } from '@/hooks/useTheme';

export default function VoiceRoute(): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <SettingsSubScreen title={t('settings.voice.title')}>
      <SettingsTtsSection colors={colors} />
    </SettingsSubScreen>
  );
}
