import React from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsSubScreen } from '@/components/settings/SettingsSubScreen';
import { ExperimentsScreen } from '@/components/settings/ExperimentsScreen';

export default function ExperimentsRoute(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <SettingsSubScreen title={t('settings.experiments.title')}>
      <ExperimentsScreen />
    </SettingsSubScreen>
  );
}
