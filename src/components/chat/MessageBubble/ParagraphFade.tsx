import React, { useEffect } from 'react';
import { type RenderRules } from '@ronradtke/react-native-markdown-display';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { type MarkdownStyles } from '@/utils/markdownTheme';
import { CachedMarkdown } from './CachedMarkdown';

const PARAGRAPH_FADE_MS = 250;

interface ParagraphFadeProps {
  animateIn: boolean;
  content: string;
  cacheable: boolean;
  markdownStyles: MarkdownStyles;
  rules: RenderRules;
}

export const ParagraphFade = React.memo(function ParagraphFade({
  animateIn,
  content,
  cacheable,
  markdownStyles,
  rules,
}: ParagraphFadeProps): React.JSX.Element {
  const opacity = useSharedValue(animateIn ? 0 : 1);
  useEffect(() => {
    if (animateIn) {
      opacity.value = withTiming(1, { duration: PARAGRAPH_FADE_MS });
    }
    // Only runs once on mount — `animateIn` is captured for the lifetime of this paragraph index.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={style}>
      <CachedMarkdown
        content={content}
        cacheable={cacheable}
        markdownStyles={markdownStyles}
        rules={rules}
      />
    </Animated.View>
  );
});
