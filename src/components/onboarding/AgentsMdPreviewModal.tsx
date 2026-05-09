/**
 * AgentsMdPreviewModal — shared full-screen modal for previewing the exact
 * bytes that ClawBoy appends to AGENTS.md.
 *
 * Used from ConventionInstallSheet, OnboardingScreen, and SettingsConventionsSection
 * so that the preview rendering and the canonical source (buildAgentsMdSection)
 * remain in one place.
 *
 * iOS modal-on-modal stacking requires this component to be rendered inside the
 * outer Modal's view tree (not as a sibling fragment). Callers that have a
 * wrapping Modal must nest this component within it. On Android both modals
 * must use transparent + statusBarTranslucent so the lower sheet stays visible
 * behind the dimmed backdrop — ensure callers set those flags on their outer modal.
 */

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { useTokens } from '@/hooks/useTokens';
import { buildAgentsMdSection, PRIMER_TOKEN_ESTIMATE } from '@/lib/openclaw/clientContext';
import { formatTokenCount } from '@/lib/formatTokens';
import { BorderRadius } from '@/constants/theme';

// Compute once at module scope so the string is never re-built on re-render.
const PREVIEW = buildAgentsMdSection();

interface AgentsMdPreviewModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AgentsMdPreviewModal({ visible, onClose }: AgentsMdPreviewModalProps): React.JSX.Element {
  const { colors } = useTheme();
  const tk = useTokens();
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              { borderBottomColor: colors.border },
            ]}
          >
            <Text
              style={[
                styles.title,
                { color: colors.foreground, fontSize: tk.fs.md },
              ]}
            >
              {t('settings.conventions.previewTitle')}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
            >
              <X size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Caption */}
          <View style={styles.captionRow}>
            <Text style={[styles.caption, { color: colors.mutedForeground, fontSize: tk.fs.xs }]}>
              {t('settings.conventions.previewCaption')}
            </Text>
            <Text style={[styles.tokenBadge, { color: colors.mutedForeground, borderColor: colors.border, fontSize: tk.fs.xs }]}>
              ~{formatTokenCount(PRIMER_TOKEN_ESTIMATE)} tokens
            </Text>
          </View>

          {/* Scrollable monospace preview */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{ padding: tk.sp.md }}
            // Limit height so the close button stays visible on short screens.
            // The outer card is already capped at 80% of screen height.
          >
            <Text
              selectable
              style={{
                color: colors.foreground,
                fontSize: tk.fs.xs,
                fontFamily: 'Menlo',
                lineHeight: 18,
              }}
            >
              {PREVIEW}
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '80%',
    borderRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    flex: 1,
    fontWeight: '600',
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
    gap: 8,
  },
  caption: {
    flex: 1,
    lineHeight: 16,
  },
  tokenBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  scroll: {
    flexGrow: 0,
  },
});
