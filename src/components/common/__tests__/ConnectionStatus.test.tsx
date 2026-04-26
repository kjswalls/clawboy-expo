import React from 'react';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { ConnectionStatus } from '../ConnectionStatus';

describe('ConnectionStatus', () => {
  it('renders the connected state', () => {
    const { toJSON } = renderWithProviders(<ConnectionStatus status="connected" />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders the connecting state', () => {
    const { toJSON } = renderWithProviders(<ConnectionStatus status="connecting" />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders the disconnected state', () => {
    const { toJSON } = renderWithProviders(<ConnectionStatus status="disconnected" />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('hides the label when showLabel is false', () => {
    const { toJSON } = renderWithProviders(
      <ConnectionStatus status="connected" showLabel={false} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
