import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Maximize2, Minimize2, Moon, Palette, Smartphone, Square, Sun, Type } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTokens } from '@/hooks/useTokens';
import type { DarkVariant, LightVariant, ThemeColors, ThemeMode, UiDensity } from '@/types';
import { SegmentedIconPill } from '../SegmentedIconPill';
import { ThemeVariantDropdown } from '../ThemeVariantDropdown';
import { createPanelStyles } from './panelStyles';

type AppearanceProps = {
  colors: ThemeColors;
  themeMode: ThemeMode;
  setThemeMode: (t: ThemeMode) => void;
  darkVariant: DarkVariant;
  setDarkVariant: (v: DarkVariant) => void;
  lightVariant: LightVariant;
  setLightVariant: (v: LightVariant) => void;
  resolvedScheme: 'light' | 'dark';
  density: UiDensity;
  setDensity: (d: UiDensity) => void;
};

type ThemeVariantId = DarkVariant | LightVariant;

const DARK_VARIANT_IDS: DarkVariant[] = ['dark', 'cygnus', 'orion', 'nebula', 'tower'];
const LIGHT_VARIANT_IDS: LightVariant[] = ['default', 'polaris', 'empress', 'vega', 'star', 'helios'];

const VARIANT_I18N_KEY: Record<string, string> = {
  dark:    'theMoon',
  default: 'theSun',
};

function isDarkVariant(id: string): id is DarkVariant {
  return ['dark', 'cygnus', 'orion', 'nebula', 'tower'].includes(id);
}

function isLightVariant(id: string): id is LightVariant {
  return ['default', 'polaris', 'empress', 'vega', 'star', 'helios'].includes(id);
}

function ThemeModeIcon({ themeMode, size, color }: { themeMode: ThemeMode; size: number; color: string }): React.JSX.Element {
  if (themeMode === 'light') return <Sun size={size} color={color} />;
  if (themeMode === 'system') return <Smartphone size={size} color={color} />;
  return <Moon size={size} color={color} />;
}

export function SettingsAppearanceSection({
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
}: AppearanceProps): React.JSX.Element {
  const { t } = useTranslation();
  const tk = useTokens();
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const styles = useMemo(() => createPanelStyles(tk), [tk]);

  const variantIds = resolvedScheme === 'dark' ? DARK_VARIANT_IDS : LIGHT_VARIANT_IDS;
  const currentVariantId: ThemeVariantId = resolvedScheme === 'dark' ? darkVariant : lightVariant;

  const variantLabel = (id: string): string =>
    t(`settings.appearance.themes.${VARIANT_I18N_KEY[id] ?? id}_label`, { defaultValue: id });
  const variantFlavor = (id: string): string =>
    t(`settings.appearance.themes.${VARIANT_I18N_KEY[id] ?? id}_flavor`, { defaultValue: '' });

  const modeOptions = [
    { value: 'system' as ThemeMode, label: t('settings.appearance.mode.optionSystem'), Icon: Smartphone },
    { value: 'light'  as ThemeMode, label: t('settings.appearance.mode.optionLight'),  Icon: Sun },
    { value: 'dark'   as ThemeMode, label: t('settings.appearance.mode.optionDark'),   Icon: Moon },
  ];

  const densityOptions = [
    { value: 'compact'     as UiDensity, label: t('settings.appearance.density.optionCompact'),     Icon: Minimize2 },
    { value: 'comfortable' as UiDensity, label: t('settings.appearance.density.optionComfortable'), Icon: Square },
    { value: 'spacious'    as UiDensity, label: t('settings.appearance.density.optionSpacious'),    Icon: Maximize2 },
  ];

  const themeModeSubtitle = (): string => {
    if (themeMode === 'system') return t('settings.appearance.mode.system', { scheme: resolvedScheme });
    if (themeMode === 'light') return t('settings.appearance.mode.light');
    return t('settings.appearance.mode.dark');
  };

  const densitySubtitle = (): string => {
    if (density === 'compact') return t('settings.appearance.density.subtitleCompact');
    if (density === 'spacious') return t('settings.appearance.density.subtitleSpacious');
    return t('settings.appearance.density.subtitleComfortable');
  };

  return (
    <View style={{ marginBottom: tk.sp.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{t('settings.appearance.title')}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Mode picker (System / Light / Dark) */}
        <View style={styles.row}>
          <ThemeModeIcon themeMode={themeMode} size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.appearance.mode.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
              {themeModeSubtitle()}
            </Text>
          </View>
          <SegmentedIconPill
            value={themeMode}
            options={modeOptions}
            onChange={setThemeMode}
            colors={colors}
          />
        </View>

        {/* Theme variant picker — always visible, options driven by resolved scheme */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.row}>
          <Palette size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.appearance.theme.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
              {variantFlavor(currentVariantId)}
            </Text>
          </View>
          <ThemeVariantDropdown
            value={currentVariantId}
            options={variantIds.map((id) => ({ id, label: variantLabel(id) }))}
            onChange={(id) => {
              if (resolvedScheme === 'dark' && isDarkVariant(id)) {
                setDarkVariant(id);
              } else if (resolvedScheme === 'light' && isLightVariant(id)) {
                setLightVariant(id);
              }
            }}
            colors={colors}
          />
        </View>

        {/* UI Density picker */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.row}>
          <Type size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.appearance.density.row')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
              {densitySubtitle()}
            </Text>
          </View>
          <SegmentedIconPill
            value={density}
            options={densityOptions}
            onChange={setDensity}
            colors={colors}
          />
        </View>

      </View>
    </View>
  );
}
