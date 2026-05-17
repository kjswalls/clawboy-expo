import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors, BorderRadius, FontSize, Spacing } from '@/constants/theme';

function ChatErrorFallbackView({ reset }: { reset: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View style={chatErrorStyles.wrap}>
      <Text style={chatErrorStyles.title}>{t('errors.chatRenderFailed')}</Text>
      <Text style={chatErrorStyles.body}>
        There was a problem displaying the chat screen.
      </Text>
      <View
        style={chatErrorStyles.btn}
        onTouchEnd={reset}
        accessible
        accessibilityRole="button"
        accessibilityLabel={t('common.tryAgain')}
      >
        <Text style={chatErrorStyles.btnText}>{t('common.tryAgain')}</Text>
      </View>
    </View>
  );
}

export function ChatErrorFallback(_error: Error, reset: () => void): React.ReactNode {
  return <ChatErrorFallbackView reset={reset} />;
}

const chatErrorStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  title: { fontSize: FontSize.md, fontWeight: '600', color: Colors.dark.foreground, textAlign: 'center' },
  body: { fontSize: FontSize.sm, color: Colors.dark.mutedForeground, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  btn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
  },
  btnText: { fontSize: FontSize.sm, fontWeight: '600', color: '#fff' },
});
