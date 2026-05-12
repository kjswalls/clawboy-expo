import * as Clipboard from 'expo-clipboard';
import Markdown from '@ronradtke/react-native-markdown-display';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Copy, X } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useConnection } from '@/contexts/ConnectionContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { chatMarkdownIt, createMarkdownStyles } from '@/utils/markdownTheme';
import { markdownFenceRule } from './CodeBlock';

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const MARKDOWN_EXTENSIONS = /\.(md|mdx|markdown)$/i;
const MAX_DISPLAY_BYTES = 256 * 1024; // 256 KB

const STABLE_RULES = {
  fence: (node: { key?: string; content: string; sourceInfo?: string }) =>
    markdownFenceRule(node),
};

export interface AgentFileViewerModalProps {
  visible: boolean;
  fileName: string | null;
  agentId: string | null;
  onClose: () => void;
}

export function AgentFileViewerModal({
  visible,
  fileName,
  agentId,
  onClose,
}: AgentFileViewerModalProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { client: clientRef, connectionState } = useConnection();
  const insets = useSafeAreaInsets();

  const [content, setContent] = useState<string | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const markdownStyles = useMemo(() => createMarkdownStyles(colors), [colors]);

  const isMarkdown = Boolean(fileName && MARKDOWN_EXTENSIONS.test(fileName));

  useEffect(() => {
    if (!visible || !fileName || !agentId) {
      setContent(null);
      setError(null);
      return;
    }

    const client = clientRef.current;
    if (!client || connectionState.status !== 'connected') {
      setError(t('chat.agentFileViewer.notConnected'));
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    setIsTruncated(false);

    void client.getAgentFile(agentId, fileName).then((result) => {
      if (cancelled) return;
      if (!result || result.missing) {
        setError(t('chat.agentFileViewer.fileNotFound', { fileName }));
      } else {
        const raw = result.content ?? '';
        if (raw.length > MAX_DISPLAY_BYTES) {
          setContent(raw.slice(0, MAX_DISPLAY_BYTES));
          setIsTruncated(true);
        } else {
          setContent(raw);
        }
      }
    }).catch(() => {
      if (!cancelled) {
        setError(t('chat.agentFileViewer.loadFailed'));
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [visible, fileName, agentId, clientRef, connectionState.status]);

  const handleCopy = useCallback(async (): Promise<void> => {
    if (!content) return;
    await Clipboard.setStringAsync(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
    >
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={t('chat.agentFileViewer.closeLabel')}
            accessibilityRole="button"
          >
            <X size={20} color={colors.foreground} />
          </Pressable>
          <Text
            style={[styles.headerTitle, { color: colors.foreground }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {fileName ?? ''}
          </Text>
          {content != null ? (
            <Pressable
              onPress={handleCopy}
              hitSlop={10}
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
              accessibilityLabel={copied ? t('chat.agentFileViewer.copiedLabel') : t('chat.agentFileViewer.copyLabel')}
              accessibilityRole="button"
            >
              {copied ? (
                <Check size={18} color={colors.success} />
              ) : (
                <Copy size={18} color={colors.mutedForeground} />
              )}
            </Pressable>
          ) : (
            <View style={styles.headerBtn} />
          )}
        </View>

        {/* Body */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error != null ? (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{error}</Text>
          </View>
        ) : content != null ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + Spacing.xl },
            ]}
            showsVerticalScrollIndicator
          >
            {isTruncated && (
              <Text style={[styles.truncatedBanner, { color: colors.mutedForeground, borderColor: colors.border }]}>
                {t('chat.agentFileViewer.truncated')}
              </Text>
            )}
            {isMarkdown ? (
              <Markdown
                style={markdownStyles}
                markdownit={chatMarkdownIt}
                rules={STABLE_RULES}
                onLinkPress={(url) => {
                  void Linking.openURL(url);
                  return true;
                }}
              >
                {content}
              </Markdown>
            ) : (
              <Text
                style={[styles.plainText, { color: colors.foreground, fontFamily: mono }]}
                selectable
              >
                {content}
              </Text>
            )}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  errorText: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  plainText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  truncatedBanner: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.sm,
  },
});
