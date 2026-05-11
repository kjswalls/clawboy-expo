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

import React, { useCallback, useMemo, useState } from 'react';
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
  /** Called when a comment input gains focus; used by host to scroll context into view. */
  onCommentFocus?: (annotationId: string) => void;
}

export function AnnotatedMessageBody({
  message,
  markdownStyles,
  files,
  onOpenFile,
  colors,
  highlightedAnnotationId = null,
  onCommentFocus,
}: AnnotatedMessageBodyProps): React.JSX.Element {
  const { annotations, addAnnotation, updateAnnotation, removeAnnotation } = useAnnotations();

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
            onCommentFocus={onCommentFocus}
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
