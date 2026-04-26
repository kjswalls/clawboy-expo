/**
 * Shared test helper — renders a component wrapped in the providers it needs.
 *
 * Usage:
 *   const { getByText } = renderWithProviders(<ConnectionStatus status="connected" />)
 */
import React from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react-native';

import { ThemeProvider } from '@/contexts/ThemeContext';

function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <ThemeProvider>{children}</ThemeProvider>;
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  return render(ui, { wrapper: Providers, ...options });
}
