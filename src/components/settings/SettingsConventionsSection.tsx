/**
 * "Inline Reply Controls" settings section.
 *
 * Shows the global install mode (Primer / Auto / Off) and, when in Auto mode,
 * a link to preview the AGENTS.md convention text.
 *
 * By default, ClawBoy delivers the convention via a per-session HTML-comment
 * primer prepended to the first user message of each session. Other clients
 * (web UI, Discord, CLI) never see this block, so they pay zero tokens.
 *
 * Users can opt into AGENTS.md auto-install for cross-session / cross-device
 * persistence. That path injects the convention into every agent prompt on
 * every turn — including non-ClawBoy sessions.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ban, FileText, Sparkles, Wand2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import { useTokens } from '@/hooks/useTokens';
import type { TokenSet } from '@/hooks/useTokens';
import {
  type GlobalInstallMode,
  useConventionInstall,
} from '@/contexts/ConventionInstallContext';
import { AgentsMdPreviewModal } from '@/components/onboarding/AgentsMdPreviewModal';
import { SegmentedIconPill } from './SegmentedIconPill';
import { InteractiveOptionsCard } from '@/components/chat/InteractiveOptionsCard';
import type { ClawboyOptionsPrompt } from '@/lib/openclaw/interactive';

type Props = {
  colors: ThemeColors;
};

// Static mock data for the inline reply controls preview.
const PREVIEW_PROMPT: ClawboyOptionsPrompt = {
  choices: [
    { label: 'Batch migration', value: 'Batch the migration in chunks' },
    { label: 'Row-by-row', value: 'Run it row-by-row for safety' },
  ],
  allowFreeText: true,
  freeTextPlaceholder: 'Or describe your preference…',
};

export function SettingsConventionsSection({ colors }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const tk = useTokens();
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const styles = useMemo(() => createPanelStyles(tk), [tk]);

  const {
    globalMode,
    setGlobalMode,
  } = useConventionInstall();

  const [previewOpen, setPreviewOpen] = useState(false);

  const modeOptions = [
    { value: 'primer' as GlobalInstallMode, label: t('settings.conventions.modeLabelPrimer'), Icon: Sparkles },
    { value: 'auto' as GlobalInstallMode, label: t('settings.conventions.modeLabelAuto'), Icon: Wand2 },
    { value: 'off' as GlobalInstallMode, label: t('settings.conventions.modeLabelOff'), Icon: Ban },
  ];

  const modeSubtitle =
    globalMode === 'auto'
      ? t('settings.conventions.modeSubtitleAuto')
      : globalMode === 'off'
        ? t('settings.conventions.modeSubtitleOff')
        : t('settings.conventions.modeSubtitlePrimer');

  return (
    <View style={{ marginBottom: tk.sp.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        {t('settings.nav.conventions.row')}
      </Text>

      {/* Description blurb */}
      <Text style={[styles.sectionBlurb, { color: colors.mutedForeground, marginBottom: tk.sp.sm }]}>
        {t('settings.conventions.descriptionPrefix')}
        <Text style={{ fontWeight: '700', color: colors.mutedForeground }}>
          {t('settings.conventions.descriptionBold')}
        </Text>
        {t('settings.conventions.descriptionSuffix')}
      </Text>

      {/* Install mode card */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: tk.sp.sm }]}>
        <View style={styles.modeBlock}>
          <View style={styles.modeLabelRow}>
            <Sparkles size={tk.iconSm} color={colors.mutedForeground} />
            <View style={styles.flex}>
              <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
                {t('settings.conventions.installModeLabel')}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
                {modeSubtitle}
              </Text>
            </View>
          </View>
          <View style={styles.pillRow}>
            <SegmentedIconPill<GlobalInstallMode>
              value={globalMode}
              options={modeOptions}
              onChange={setGlobalMode}
              colors={colors}
            />
          </View>
        </View>

        {/* Convention preview — available for all install modes */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable
          onPress={() => setPreviewOpen(true)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel="Preview convention"
        >
          <FileText size={tk.iconSm} color={colors.mutedForeground} />
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: tk.fs.sm, fontWeight: '500' }}>
              {t('settings.conventions.agentsMdPreviewTitle')}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: tk.fs.xs, marginTop: 1 }}>
              {t('settings.conventions.agentsMdPreviewSubtitle')}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Inline reply controls preview */}
      <Text style={[styles.previewHeader, { color: colors.mutedForeground, marginTop: tk.sp.md }]}>
        {t('settings.conventions.previewHeader')}
      </Text>
      <View
        style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        pointerEvents="none"
      >
        {/* Mock assistant bubble */}
        <View style={[styles.assistantBubble, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.assistantBubbleText, { color: colors.foreground }]}>
            {t('settings.conventions.previewQuestion')}
          </Text>
        </View>

        {/* Non-interactive options card */}
        <View pointerEvents="none">
          <InteractiveOptionsCard
            prompt={PREVIEW_PROMPT}
            surveyState={{ consumed: false }}
            disabled
            onPick={() => {}}
            onSubmitFreeText={() => {}}
          />
        </View>
      </View>

      <AgentsMdPreviewModal
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

function createPanelStyles(tk: TokenSet) {
  return StyleSheet.create({
    flex: { flex: 1 },
    sectionTitle: { fontSize: tk.fs.sm, fontWeight: '600' as const, marginBottom: 8 },
    sectionBlurb: { fontSize: tk.fs.xs, lineHeight: 18 },
    previewHeader: {
      fontSize: tk.fs.xs,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
      marginBottom: tk.sp.xs,
    },
    previewCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: BorderRadius.xl,
      overflow: 'hidden' as const,
      paddingHorizontal: tk.sp.sm,
      paddingTop: tk.sp.sm,
      paddingBottom: tk.sp.xs,
    },
    assistantBubble: {
      alignSelf: 'flex-start' as const,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: tk.sp.sm,
      paddingVertical: tk.sp.xs,
      maxWidth: '85%',
      marginBottom: 2,
    },
    assistantBubbleText: {
      fontSize: tk.fs.sm,
      lineHeight: 20,
    },
    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: BorderRadius.xl,
      overflow: 'hidden' as const,
    },
    modeBlock: {
      paddingHorizontal: tk.sp.md,
      paddingTop: tk.sp.sm,
      paddingBottom: tk.sp.sm,
      gap: tk.sp.sm,
    },
    modeLabelRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: tk.sp.sm,
    },
    pillRow: {
      alignItems: 'flex-start' as const,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: tk.sp.sm,
      paddingHorizontal: tk.sp.md,
      paddingVertical: tk.sp.sm,
      minHeight: tk.minTouch,
    },
    divider: { height: StyleSheet.hairlineWidth, marginHorizontal: tk.sp.md },
  });
}

// Module-level fallback styles.
const styles = createPanelStyles({
  fs: FontSize as TokenSet['fs'],
  sp: Spacing as TokenSet['sp'],
  minTouch: 44,
  iconSm: 15,
  iconMd: 18,
  iconLg: 20,
});
// Suppress unused-var warnings for the safety fallback above.
void styles;
