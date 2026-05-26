import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors, BorderRadius, FontSize, Spacing } from '@/constants/theme';

function ChatErrorFallbackView({ reset }: { reset: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const [retryCount, setRetryCount] = useState(0);

  const onRetry = (): void => {
    setRetryCount((c) => c + 1);
    reset();
  };

  const onSendReport = (): void => {
    // Best-effort: log intent. The next launch's LastCrash banner will pick up
    // the recordCrash() record already written by ErrorBoundary.componentDidCatch
    // and route the user to the FeedbackSheet auto-fill path.
    console.warn('[ChatErrorFallback] user requested bug report');
    Alert.alert(
      t('errors.sendBugReport'),
      t('errors.forceQuitInstruction'),
    );
  };

  return (
    <View style={chatErrorStyles.wrap}>
      <Text style={chatErrorStyles.title}>{t('errors.chatRenderFailed')}</Text>
      <Text style={chatErrorStyles.body}>
        {t('errors.chatRenderFailedBody')}
      </Text>
      {retryCount > 0 ? (
        <Text style={chatErrorStyles.hint}>
          {t('errors.tryAgainFailedHint')}
        </Text>
      ) : null}
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [chatErrorStyles.btn, pressed && chatErrorStyles.btnPressed]}
        accessibilityRole="button"
        accessibilityLabel={t('common.tryAgain')}
      >
        <Text style={chatErrorStyles.btnText}>{t('common.tryAgain')}</Text>
      </Pressable>
      <Pressable
        onPress={onSendReport}
        style={({ pressed }) => [chatErrorStyles.btnSecondary, pressed && chatErrorStyles.btnPressed]}
        accessibilityRole="button"
        accessibilityLabel={t('errors.sendBugReport')}
      >
        <Text style={chatErrorStyles.btnSecondaryText}>{t('errors.sendBugReport')}</Text>
      </Pressable>
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
  hint: {
    fontSize: FontSize.xs,
    color: Colors.dark.mutedForeground,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 300,
    fontStyle: 'italic',
  },
  btn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
  },
  btnPressed: { opacity: 0.8 },
  btnText: { fontSize: FontSize.sm, fontWeight: '600', color: '#fff' },
  btnSecondary: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.border,
  },
  btnSecondaryText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.dark.foreground },
});
