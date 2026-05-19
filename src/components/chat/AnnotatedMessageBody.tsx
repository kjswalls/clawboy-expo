/**
 * AnnotatedMessageBody — replaces the standard assistant bubble content when
 * the message is in annotate mode.
 *
 * Renders each section of the message (from splitMessageIntoBlocks) with:
 *   - Full markdown (non-streaming, cacheable)
 *   - Existing InlineAnnotationRow read-only cards beneath the section
 *   - "Add comment" (tap) / "Add range comment" (long-press) affordance
 *
 * Uses useAnnotations() directly so it can add/update/remove without prop-drilling.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { MarkdownStyles } from '@/utils/markdownTheme';
import { useAnnotations } from '@/contexts/AnnotationContext';
import { splitMessageIntoBlocks, type MessageBlock } from '@/lib/messageBlocks';
import type { ChatUiMessage } from '@/types/chat-ui';
import type { AgentFile } from '@/lib/openclaw/types';
import type { ThemeColors } from '@/types';
import { SectionBlock } from './SectionBlock';
import { SectionRangePickerModal } from './SectionRangePickerModal';

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
  const { t } = useTranslation();
  const { annotations, addAnnotation, removeAnnotation, setTargetAnnotationId } = useAnnotations();

  const sections = useMemo(
    () => splitMessageIntoBlocks(message.content),
    [message.content],
  );

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
      const annotation = addAnnotation(
        message.id,
        { kind: 'range', start: globalStart, end: globalEnd },
        quotedText,
        '',
      );
      setRangeSection(null);
      setTargetAnnotationId(annotation.id);
    },
    [addAnnotation, message.id, setTargetAnnotationId],
  );

  const handleEditPress = useCallback(
    (id: string): void => {
      setTargetAnnotationId(id);
    },
    [setTargetAnnotationId],
  );

  const handleLongPress = useCallback(
    (id: string): void => {
      Alert.alert(
        t('chat.annotate.optionsTitle'),
        undefined,
        [
          {
            text: t('chat.annotate.edit'),
            onPress: () => setTargetAnnotationId(id),
          },
          {
            text: t('chat.annotate.deleteAnnotation'),
            style: 'destructive',
            onPress: () => removeAnnotation(id),
          },
          { text: t('common.cancel'), style: 'cancel' },
        ],
      );
    },
    [removeAnnotation, setTargetAnnotationId, t],
  );

  const handleDeletePress = useCallback(
    (id: string): void => {
      Alert.alert(
        t('chat.annotate.deleteCommentTitle'),
        t('chat.annotate.deleteCommentMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('chat.annotate.deleteCommentAction'),
            style: 'destructive',
            onPress: () => removeAnnotation(id),
          },
        ],
      );
    },
    [removeAnnotation, t],
  );

  return (
    <>
      {sections.map((section) => {
        const sectionAnnotations = messageAnnotations.filter((a) => {
          if (a.anchor.kind === 'block') return a.anchor.blockIndex === section.index;
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
            removeAnnotation={removeAnnotation}
            onOpenRangePicker={setRangeSection}
            highlightedAnnotationId={highlightedAnnotationId}
            onEditPress={handleEditPress}
            onLongPress={handleLongPress}
            onDeletePress={handleDeletePress}
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
