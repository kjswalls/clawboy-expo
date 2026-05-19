import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import type { MarkdownStyles } from '@/utils/markdownTheme';
import type { Annotation } from '@/lib/annotations';
import type { MessageBlock } from '@/lib/messageBlocks';
import type { ChatUiMessage } from '@/types/chat-ui';
import type { AgentFile } from '@/lib/openclaw/types';
import type { useAnnotations } from '@/contexts/AnnotationContext';
import { useAnnotations as useAnnotationsHook } from '@/contexts/AnnotationContext';
import { useLiveDraftFor } from '@/contexts/AnnotationDraftContext';
import { useSectionLayoutMaybe } from './AnnotationLayoutContext';
import { InlineAnnotationRow } from './InlineAnnotationRow';
import { SectionMarkdown } from './SectionMarkdown';
import { AddCommentRow } from './AddCommentRow';

export interface SectionBlockProps {
  section: MessageBlock;
  sectionAnnotations: Annotation[];
  message: ChatUiMessage;
  markdownStyles: MarkdownStyles;
  files: AgentFile[];
  onOpenFile: (name: string) => void;
  colors: ThemeColors;
  addAnnotation: ReturnType<typeof useAnnotations>['addAnnotation'];
  removeAnnotation: ReturnType<typeof useAnnotations>['removeAnnotation'];
  onOpenRangePicker: (section: MessageBlock) => void;
  highlightedAnnotationId?: string | null;
  onEditPress: (id: string) => void;
  onLongPress: (id: string) => void;
  onDeletePress: (id: string) => void;
}

export function SectionBlock({
  section,
  sectionAnnotations,
  message,
  markdownStyles,
  files,
  onOpenFile,
  colors,
  addAnnotation,
  removeAnnotation,
  onOpenRangePicker,
  highlightedAnnotationId = null,
  onEditPress,
  onLongPress,
  onDeletePress,
}: SectionBlockProps): React.JSX.Element {
  const { setTargetAnnotationId, targetAnnotationId } = useAnnotationsHook();

  const sectionLayout = useSectionLayoutMaybe();
  const sectionRef = useRef<View>(null);
  useEffect(() => {
    if (!sectionLayout) return;
    const key = `${message.id}::${section.index}`;
    if (sectionRef.current) sectionLayout.register(key, sectionRef.current);
    return () => { sectionLayout.unregister(key); };
  }, [message.id, section.index, sectionLayout]);

  // Disable "Add another comment" when the current target annotation in this section
  // has no saved text and the live draft is also empty (nothing typed yet).
  const currentTargetInSection = sectionAnnotations.find((a) => a.id === targetAnnotationId);
  const liveDraft = useLiveDraftFor(targetAnnotationId ?? '');
  const addAnotherDisabled =
    currentTargetInSection !== undefined &&
    currentTargetInSection.comment === '' &&
    (liveDraft ?? '').trim() === '';

  const handleAddBlock = useCallback((): void => {
    const a = addAnnotation(
      message.id,
      { kind: 'block', blockIndex: section.index },
      section.raw,
      '',
    );
    setTargetAnnotationId(a.id);
  }, [addAnnotation, message.id, section, setTargetAnnotationId]);

  const handleAddRange = useCallback((): void => {
    onOpenRangePicker(section);
  }, [onOpenRangePicker, section]);

  return (
    <View ref={sectionRef} style={styles.sectionBlock}>
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
          highlighted={a.id === highlightedAnnotationId}
          onEditPress={onEditPress}
          onLongPress={onLongPress}
          onDeletePress={onDeletePress}
          colors={colors}
        />
      ))}

      <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

      <AddCommentRow
        hasExisting={sectionAnnotations.length > 0}
        disabled={addAnotherDisabled}
        onAddBlock={handleAddBlock}
        onAddRange={handleAddRange}
        colors={colors}
      />
    </View>
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
});
