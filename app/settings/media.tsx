import React from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsSubScreen } from '@/components/settings/SettingsSubScreen';
import { SettingsMediaSection } from '@/components/settings/sections/SettingsMediaSection';
import { useTheme } from '@/hooks/useTheme';

export default function MediaRoute(): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <SettingsSubScreen title={t('settings.nav.media.row')}>
      <SettingsMediaSection colors={colors} />
    </SettingsSubScreen>
  );
}
