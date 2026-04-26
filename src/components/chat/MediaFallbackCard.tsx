import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
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

function kindLabel(kind: MediaFallbackKind): string {
  switch (kind) {
    case 'image': return 'Image';
    case 'video': return 'Video';
    case 'audio': return 'Audio';
    default: return 'File';
  }
}

function reasonSubtitle(
  kind: MediaFallbackKind,
  reason: MediaFailureReason | undefined,
  agentPathBlocked?: boolean,
): string {
  switch (reason) {
    case 'html':        return "Server didn't return this file";
    case 'auth-failed': return 'Not authorized to load this';
    case 'not-found':   return agentPathBlocked ? 'Path not allowed by gateway' : "File isn't on the server";
    default:            return `${kindLabel(kind)} unavailable`;
  }
}

/**
 * Returns true when the 404 is almost certainly the gateway's mediaLocalRoots
 * allowlist rejecting an agent-generated path (e.g. /tmp/...).
 *
 * Conditions (all must be true):
 *  - HTTP 404
 *  - URL targets the /__openclaw__/assistant-media endpoint
 *  - ?source= param decodes to an absolute-looking path (/…, ~/…, file://)
 *
 * This is distinct from a "cross-client" 404 (file uploaded via Discord, etc.)
 * where the URL would be an arbitrary https:// URL, not an assistant-media proxy.
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

function buildInfoMessage(subtitle: string, diagnosis: MediaDiagnosis | undefined): string {
  const lines: string[] = [subtitle];

  if (diagnosis) {
    lines.push('');
    if (diagnosis.sanitizedUrl) {
      lines.push(`URL: ${diagnosis.sanitizedUrl}`);
    }
    if (diagnosis.httpStatus !== undefined) {
      const statusLine = diagnosis.httpStatusText
        ? `HTTP ${diagnosis.httpStatus} ${diagnosis.httpStatusText}`
        : `HTTP ${diagnosis.httpStatus}`;
      lines.push(statusLine);
    }
    if (diagnosis.contentType) {
      lines.push(`Content-Type: ${diagnosis.contentType}`);
    }
    if (diagnosis.contentLength) {
      lines.push(`Content-Length: ${diagnosis.contentLength}`);
    }
    if (diagnosis.snippet) {
      lines.push('');
      lines.push(`Response preview:\n${diagnosis.snippet}`);
    }
  }

  lines.push('');
  if (isAgentGeneratedAllowlistMiss(diagnosis)) {
    lines.push(
      'Your agent saved this file to a path the gateway won\'t serve. ' +
      'Ask your agent to save generated media under ~/.openclaw/workspace/, ' +
      'or add the path to mediaLocalRoots in your gateway config.',
    );
  } else {
    lines.push(
      'This may have been uploaded from another client (for example Discord). ' +
      'ClawBoy tried to load it from your OpenClaw gateway but access failed. ' +
      'The other app may still show the original.',
    );
  }

  return lines.join('\n');
}

function showFallbackInfo(subtitle: string, diagnosis: MediaDiagnosis | undefined): void {
  Alert.alert(
    "Couldn't load this file",
    buildInfoMessage(subtitle, diagnosis),
    [{ text: 'OK' }],
  );
}

/**
 * Displayed when a media URL fails to load.
 * Shows a small pill with the file kind icon, truncated name, and an info button.
 * When `diagnosis` is provided it shows specific HTTP details in the info Alert.
 * When only `reason` is provided (legacy) it shows a simpler subtitle.
 */
export function MediaFallbackCard({ kind, name, reason, diagnosis }: MediaFallbackCardProps): React.JSX.Element {
  const { colors } = useTheme();
  const effectiveReason = diagnosis?.reason ?? reason;
  const agentPathBlocked = isAgentGeneratedAllowlistMiss(diagnosis);
  const subtitle = reasonSubtitle(kind, effectiveReason, agentPathBlocked);
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
        onPress={() => showFallbackInfo(subtitle, diagnosis)}
        hitSlop={8}
        accessibilityLabel="Why can't I see this file?"
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
