import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Image, Clapperboard, Music, FileQuestion, Info } from 'lucide-react-native';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { MediaDiagnosis, MediaFailureReason } from '@/lib/media/diagnoseMediaFailure';

export type MediaFallbackKind = 'image' | 'video' | 'audio' | 'file';

interface MediaFallbackCardProps {
  kind: MediaFallbackKind;
  name: string;
  /** If provided, shows a more specific subtitle derived from the diagnosis result. */
  reason?: MediaFailureReason;
  /** Full diagnosis with HTTP details — shown in the info Alert when available. */
  diagnosis?: MediaDiagnosis;
}

function KindIcon({ kind, color }: { kind: MediaFallbackKind; color: string }): React.JSX.Element {
  const size = 20;
  switch (kind) {
    case 'image':
      return <Image size={size} color={color} />;
    case 'video':
      return <Clapperboard size={size} color={color} />;
    case 'audio':
      return <Music size={size} color={color} />;
    default:
      return <FileQuestion size={size} color={color} />;
  }
}

/**
 * Returns true when the 404 is almost certainly the gateway's mediaLocalRoots
 * allowlist rejecting an agent-generated path (e.g. /tmp/...).
 */
export function isAgentGeneratedAllowlistMiss(diagnosis: MediaDiagnosis | undefined): boolean {
  if (!diagnosis) return false;
  if (diagnosis.httpStatus !== 404) return false;
  const url = diagnosis.sanitizedUrl;
  if (!url) return false;
  try {
    const u = new URL(url);
    if (!u.pathname.includes('/__openclaw__/assistant-media')) return false;
    const source = u.searchParams.get('source');
    if (!source) return false;
    const decoded = decodeURIComponent(source);
    return decoded.startsWith('/') || decoded.startsWith('~/') || decoded.startsWith('file://');
  } catch {
    return false;
  }
}

/**
 * Displayed when a media URL fails to load.
 * Shows a small pill with the file kind icon, truncated name, and an info button.
 * When `diagnosis` is provided it shows specific HTTP details in the info Alert.
 * When only `reason` is provided (legacy) it shows a simpler subtitle.
 */
export function MediaFallbackCard({ kind, name, reason, diagnosis }: MediaFallbackCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const effectiveReason = diagnosis?.reason ?? reason;
  const agentPathBlocked = isAgentGeneratedAllowlistMiss(diagnosis);

  const kindLabelStr = (() => {
    switch (kind) {
      case 'image': return t('chat.media.imageKind');
      case 'video': return t('chat.media.videoKind');
      case 'audio': return t('chat.media.audioKind');
      default:      return t('chat.media.fileKind');
    }
  })();

  const subtitle = (() => {
    switch (effectiveReason) {
      case 'html':        return t('chat.media.htmlError');
      case 'auth-failed': return t('chat.media.authError');
      case 'not-found':   return agentPathBlocked ? t('chat.media.agentPathBlocked') : t('chat.media.notFound');
      default:            return t('chat.media.unavailable', { kind: kindLabelStr });
    }
  })();

  const buildInfoMessage = (): string => {
    const lines: string[] = [subtitle];

    if (diagnosis) {
      lines.push('');
      if (diagnosis.sanitizedUrl) {
        lines.push(`${t('chat.media.diag.urlLabel')} ${diagnosis.sanitizedUrl}`);
      }
      if (diagnosis.httpStatus !== undefined) {
        const statusLine = diagnosis.httpStatusText
          ? `HTTP ${diagnosis.httpStatus} ${diagnosis.httpStatusText}`
          : `HTTP ${diagnosis.httpStatus}`;
        lines.push(statusLine);
      }
      if (diagnosis.contentType) {
        lines.push(`${t('chat.media.diag.contentTypeLabel')} ${diagnosis.contentType}`);
      }
      if (diagnosis.contentLength) {
        lines.push(`${t('chat.media.diag.contentLengthLabel')} ${diagnosis.contentLength}`);
      }
      if (diagnosis.snippet) {
        lines.push('');
        lines.push(`${t('chat.media.diag.responsePreviewLabel')}\n${diagnosis.snippet}`);
      }
    }

    lines.push('');
    if (agentPathBlocked) {
      lines.push(t('chat.media.loadFailAgentPath'));
    } else {
      lines.push(t('chat.media.loadFailOtherClient'));
    }

    return lines.join('\n');
  };

  const displayName = name.length > 40 ? `${name.slice(0, 37)}…` : name;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.secondary, borderColor: colors.border },
      ]}
    >
      <View style={styles.iconWrap}>
        <KindIcon kind={kind} color={colors.mutedForeground} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>{subtitle}</Text>
        <Text
          style={[styles.name, { color: colors.mutedForeground }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {displayName}
        </Text>
      </View>
      <Pressable
        onPress={() => Alert.alert(t('chat.media.loadFailTitle'), buildInfoMessage(), [{ text: t('chat.media.loadFailOk') }])}
        hitSlop={8}
        accessibilityLabel={t('chat.media.whyCantSee')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.infoBtn, pressed && styles.infoBtnPressed]}
      >
        <Info size={16} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    maxWidth: '92%',
    marginVertical: Spacing.xs,
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  label: {
    fontSize: FontSize.xs,
    opacity: 0.7,
  },
  name: {
    fontSize: FontSize.sm,
    opacity: 0.6,
  },
  infoBtn: {
    padding: 4,
    borderRadius: 6,
    opacity: 0.6,
  },
  infoBtnPressed: {
    opacity: 0.35,
  },
});
