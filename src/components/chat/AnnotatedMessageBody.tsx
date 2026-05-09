/**
 * AnnotatedMessageBody — replaces the standard assistant bubble content when
 * the message is in annotate mode.
 *
 * Renders each section of the message (from splitMessageIntoBlocks) with:
 *   - Full markdown (non-streaming, cacheable)
 *   - Existing InlineAnnotationRow cards beneath the section
 *   - "Add comment" (tap) / "Add range comment" (long-press) affordance
 *
 * Uses useAnnotations() directly so it can add/update/remove without prop-drilling.
 */

import Markdown from '@ronradtke/react-native-markdown-display';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MessageSquarePlus, TextSelect } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import type { MarkdownStyles } from '@/utils/markdownTheme';
import { chatMarkdownIt } from '@/utils/markdownTheme';
import { getCachedMarkdownAst } from '@/utils/markdownCache';
import { useAnnotations } from '@/contexts/AnnotationContext';
import type { Annotation } from '@/lib/annotations';
import { splitMessageIntoBlocks, type MessageBlock } from '@/lib/messageBlocks';
import type { ChatUiMessage } from '@/types/chat-ui';
import type { AgentFile } from '@/lib/openclaw/types';
import { extractBareHref, findAgentFileMatch, isInternalLink } from '@/utils/links';
import { markdownFenceRule } from './CodeBlock';
import { InlineAnnotationRow } from './InlineAnnotationRow';
import { SectionRangePickerModal } from './SectionRangePickerModal';

// ---------------------------------------------------------------------------
// Inline markdown rules (subset of MessageBubble: fence + paragraph + link)
// ---------------------------------------------------------------------------

function NOOP_ON_LINK_PRESS(): boolean { return false; }

function makeParagraphRule(paragraphStyle: object) {
  return function ParagraphRule(
    node: { key?: string },
    children: React.ReactNode,
  ): React.JSX.Element {
    return <Text key={node.key} style={paragraphStyle}>{children}</Text>;
  };
}

function makeLinkRule(
  files: AgentFile[],
  onOpenFile: (name: string) => void,
  linkStyle: object,
  textStyle: object,
) {
  return function LinkRule(
    node: { key?: string; attributes?: { href?: string } },
    children: React.ReactNode,
  ): React.JSX.Element {
    const href = String(node.attributes?.href ?? '');
    if (!isInternalLink(href)) {
      return (
        <Text
          key={node.key}
          style={linkStyle}
          accessibilityRole="link"
          onPress={() => { void Linking.openURL(href); }}
        >
          {children}
        </Text>
      );
    }
    const match = findAgentFileMatch(href, files);
    const fileName = match?.name ?? extractBareHref(href) ?? href;
    return (
      <Text
        key={node.key}
        style={linkStyle}
        accessibilityRole="link"
        onPress={() => onOpenFile(fileName)}
      >
        {children}
      </Text>
    );
  };
}

// ---------------------------------------------------------------------------
// SectionMarkdown
// ---------------------------------------------------------------------------

interface SectionMarkdownProps {
  raw: string;
  markdownStyles: MarkdownStyles;
  files: AgentFile[];
  onOpenFile: (name: string) => void;
}

function SectionMarkdown({
  raw,
  markdownStyles,
  files,
  onOpenFile,
}: SectionMarkdownProps): React.JSX.Element {
  const rules = useMemo(() => ({
    fence: (node: { key?: string; content: string; sourceInfo?: string }) => markdownFenceRule(node),
    paragraph: makeParagraphRule(markdownStyles.paragraph ?? {}),
    link: makeLinkRule(files, onOpenFile, markdownStyles.link ?? {}, markdownStyles.text ?? {}),
  }), [markdownStyles, files, onOpenFile]);

  const cachedAst = getCachedMarkdownAst(raw, chatMarkdownIt);
  const children = (cachedAst ?? raw) as unknown as string;

  return (
    <Markdown
      style={markdownStyles}
      markdownit={chatMarkdownIt}
      rules={rules}
      onLinkPress={NOOP_ON_LINK_PRESS}
    >
      {children}
    </Markdown>
  );
}

// ---------------------------------------------------------------------------
// AddCommentRow — "Add comment" / "Add range comment" affordance per section
// ---------------------------------------------------------------------------

interface AddCommentRowProps {
  onAddBlock: () => void;
  onAddRange: () => void;
  colors: ThemeColors;
}

function AddCommentRow({ onAddBlock, onAddRange, colors }: AddCommentRowProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View style={styles.addRow}>
      <Pressable
        onPress={onAddBlock}
        style={({ pressed }) => [
          styles.addBtn,
          { borderColor: `${colors.primary}50`, backgroundColor: `${colors.primary}0a` },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityLabel={t('chat.annotate.addComment')}
        accessibilityRole="button"
      >
        <MessageSquarePlus size={12} color={colors.primary} />
        <Text style={[styles.addBtnText, { color: colors.primary }]}>
          {t('chat.annotate.addComment')}
        </Text>
      </Pressable>
      <Pressable
        onPress={onAddRange}
        style={({ pressed }) => [
          styles.addRangeBtn,
          { borderColor: colors.border },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityLabel={t('chat.annotate.addRangeComment')}
        accessibilityRole="button"
        hitSlop={8}
      >
        <TextSelect size={12} color={colors.mutedForeground} />
        <Text style={[styles.addRangeBtnText, { color: colors.mutedForeground }]}>
          {t('chat.annotate.addRangeComment')}
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SectionBlock — one section's markdown + its annotation rows + add affordance
// ---------------------------------------------------------------------------

interface SectionBlockProps {
  section: MessageBlock;
  sectionAnnotations: Annotation[];
  message: ChatUiMessage;
  markdownStyles: MarkdownStyles;
  files: AgentFile[];
  onOpenFile: (name: string) => void;
  colors: ThemeColors;
  addAnnotation: ReturnType<typeof useAnnotations>['addAnnotation'];
  /** Simplified updater: (id, comment) → updates comment only. */
  updateAnnotation: (id: string, comment: string) => void;
  removeAnnotation: ReturnType<typeof useAnnotations>['removeAnnotation'];
  onOpenRangePicker: (section: MessageBlock) => void;
  highlightedAnnotationId?: string | null;
}

function SectionBlock({
  section,
  sectionAnnotations,
  message,
  markdownStyles,
  files,
  onOpenFile,
  colors,
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
  onOpenRangePicker,
  highlightedAnnotationId = null,
}: SectionBlockProps): React.JSX.Element {
  const [latestAddedId, setLatestAddedId] = useState<string | null>(null);

  const handleAddBlock = useCallback((): void => {
    const a = addAnnotation(
      message.id,
      { kind: 'block', blockIndex: section.index },
      section.raw,
      '',
    );
    setLatestAddedId(a.id);
  }, [addAnnotation, message.id, section]);

  const handleAddRange = useCallback((): void => {
    onOpenRangePicker(section);
  }, [onOpenRangePicker, section]);

  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionMarkdownWrapper}>
        <SectionMarkdown
          raw={section.raw}
          markdownStyles={markdownStyles}
          files={files}
          onOpenFile={onOpenFile}
        />
      </View>

      {sectionAnnotations.map((a) => (
        <InlineAnnotationRow
          key={a.id}
          annotation={a}
          autoFocus={a.id === latestAddedId}
          highlighted={a.id === highlightedAnnotationId}
          onUpdateComment={updateAnnotation}
          onRemove={removeAnnotation}
          colors={colors}
        />
      ))}

      <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

      <AddCommentRow
        onAddBlock={handleAddBlock}
        onAddRange={handleAddRange}
        colors={colors}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// AnnotatedMessageBody
// ---------------------------------------------------------------------------

export interface AnnotatedMessageBodyProps {
  message: ChatUiMessage;
  markdownStyles: MarkdownStyles;
  files: AgentFile[];
  onOpenFile: (name: string) => void;
  colors: ThemeColors;
  /** Annotation id to flash-highlight (from pill cycle). */
  highlightedAnnotationId?: string | null;
}

export function AnnotatedMessageBody({
  message,
  markdownStyles,
  files,
  onOpenFile,
  colors,
  highlightedAnnotationId = null,
}: AnnotatedMessageBodyProps): React.JSX.Element {
  const { annotations, addAnnotation, updateAnnotation, removeAnnotation } = useAnnotations();

  const sections = useMemo(
    () => splitMessageIntoBlocks(message.content),
    [message.content],
  );

  // Only annotations that belong to this message
  const messageAnnotations = useMemo(
    () => annotations.filter((a) => a.messageId === message.id),
    [annotations, message.id],
  );

  const [rangeSection, setRangeSection] = useState<MessageBlock | null>(null);

  const handleSaveRange = useCallback(
    (
      _localStart: number,
      _localEnd: number,
      globalStart: number,
      globalEnd: number,
      quotedText: string,
    ): void => {
      addAnnotation(
        message.id,
        { kind: 'range', start: globalStart, end: globalEnd },
        quotedText,
        '',
      );
      setRangeSection(null);
    },
    [addAnnotation, message.id],
  );

  const handleUpdateComment = useCallback(
    (id: string, comment: string): void => {
      updateAnnotation(id, { comment });
    },
    [updateAnnotation],
  );

  return (
    <>
      {sections.map((section) => {
        const sectionAnnotations = messageAnnotations.filter((a) => {
          if (a.anchor.kind === 'block') return a.anchor.blockIndex === section.index;
          // Range annotations: anchor by global start offset falling in this section
          return a.anchor.start >= section.sourceStart && a.anchor.start < section.sourceEnd;
        });

        return (
          <SectionBlock
            key={section.index}
            section={section}
            sectionAnnotations={sectionAnnotations}
            message={message}
            markdownStyles={markdownStyles}
            files={files}
            onOpenFile={onOpenFile}
            colors={colors}
            addAnnotation={addAnnotation}
            updateAnnotation={handleUpdateComment}
            removeAnnotation={removeAnnotation}
            onOpenRangePicker={setRangeSection}
            highlightedAnnotationId={highlightedAnnotationId}
          />
        );
      })}

      <SectionRangePickerModal
        visible={rangeSection !== null}
        section={rangeSection}
        onSave={handleSaveRange}
        onClose={() => setRangeSection(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sectionBlock: {
    width: '100%',
    gap: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  sectionMarkdownWrapper: {
    width: '100%',
  },
  sectionDivider: {
    height: 1,
    marginVertical: Spacing.sm,
    opacity: 0.4,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  addBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  addRangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  addRangeBtnText: {
    fontSize: FontSize.xs,
  },
});
