import React from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsSubScreen } from '@/components/settings/SettingsSubScreen';
import { SettingsAppearanceSection } from '@/components/settings/SettingsMetaPanels';
import { useTheme } from '@/hooks/useTheme';

export default function AppearanceRoute(): React.JSX.Element {
  const { t } = useTranslation();
  const {
    colors,
    themeMode,
    setThemeMode,
    darkVariant,
    setDarkVariant,
    lightVariant,
    setLightVariant,
    resolvedScheme,
    density,
    setDensity,
  } = useTheme();

  return (
    <SettingsSubScreen title={t('settings.appearance.title')}>
      <SettingsAppearanceSection
        colors={colors}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        darkVariant={darkVariant}
        setDarkVariant={setDarkVariant}
        lightVariant={lightVariant}
        setLightVariant={setLightVariant}
        resolvedScheme={resolvedScheme}
        density={density}
        setDensity={setDensity}
      />
    </SettingsSubScreen>
  );
}
