import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';

export function MarkdownErrorFallback({ content }: { content: string }): React.JSX.Element {
  const { t } = useTranslation();
  const onLongPress = useCallback(async () => {
    if (content) await Clipboard.setStringAsync(content);
  }, [content]);

  return (
    <Pressable onLongPress={onLongPress} accessibilityLabel={t('chat.message.markdownErrorLabel')}>
      <Text style={markdownErrorStyles.error}>
        {t('chat.message.markdownError')}
      </Text>
    </Pressable>
  );
}

const markdownErrorStyles = StyleSheet.create({
  error: {
    fontSize: 12,
    color: 'rgba(168, 85, 247, 0.7)',
    fontStyle: 'italic',
  },
});
