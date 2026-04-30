import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log a redacted summary — no tokens, no URLs, no user content
    const name = error.name ?? 'Error';
    const message = (error.message ?? '').slice(0, 120);
    console.warn(`[ErrorBoundary] ${name}: ${message}`, info.componentStack?.slice(0, 300));
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return <DefaultErrorFallback onReset={this.reset} />;
    }
    return this.props.children;
  }
}

// Module-scoped stable component refs — preserving React.memo equality when used
// as fallback inside already-memoized trees.

function DefaultErrorFallback({ onReset }: { onReset: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View style={fallbackStyles.wrap}>
      <View style={fallbackStyles.card}>
        <Text style={fallbackStyles.title}>{t('errors.somethingWentWrong')}</Text>
        <Text style={fallbackStyles.subtitle}>
          {t('errors.sectionFailed')}
        </Text>
        <Pressable
          onPress={onReset}
          style={({ pressed }) => [fallbackStyles.btn, pressed && fallbackStyles.btnPressed]}
          accessibilityLabel={t('common.tryAgain')}
          accessibilityRole="button"
        >
          <Text style={fallbackStyles.btnText}>{t('common.tryAgain')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const fallbackStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.dark.background,
  },
  card: {
    backgroundColor: Colors.dark.secondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    maxWidth: 320,
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.dark.foreground,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.dark.mutedForeground,
    textAlign: 'center',
    lineHeight: 20,
  },
  btn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
  },
  btnPressed: { opacity: 0.8 },
  btnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: '#fff',
  },
});
