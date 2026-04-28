import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { PinMismatchScreen } from '../PinMismatchScreen';

const OBSERVED_SPKI = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabb';
const ALLOWED_SPKI = '1122334455667788990011223344556677889900112233445566778899001122334455';

describe('PinMismatchScreen', () => {
  const baseProps = {
    visible: true,
    observedSpki: OBSERVED_SPKI,
    allowedSpkis: [ALLOWED_SPKI],
    onReject: jest.fn(),
    onApproveNewKey: jest.fn(),
    onForgetServer: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the full-screen blocker (snapshot)', () => {
    const { toJSON } = renderWithProviders(<PinMismatchScreen {...baseProps} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders with no allowed spkis (snapshot)', () => {
    const { toJSON } = renderWithProviders(
      <PinMismatchScreen {...baseProps} allowedSpkis={[]} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('calls onReject when reject button is pressed', () => {
    const { getByLabelText } = renderWithProviders(<PinMismatchScreen {...baseProps} />);
    fireEvent.press(getByLabelText('Reject and disconnect'));
    expect(baseProps.onReject).toHaveBeenCalledTimes(1);
  });

  it('approve button is disabled until correct suffix is typed', () => {
    const { getByLabelText, getByPlaceholderText } = renderWithProviders(
      <PinMismatchScreen {...baseProps} />,
    );
    const approveBtn = getByLabelText('Approve new certificate key');
    // Without input it should be disabled
    fireEvent.press(approveBtn);
    expect(baseProps.onApproveNewKey).not.toHaveBeenCalled();

    // Type the wrong suffix
    const input = getByPlaceholderText(OBSERVED_SPKI.slice(-8).toUpperCase());
    fireEvent.changeText(input, 'XXXXXXXX');
    fireEvent.press(approveBtn);
    expect(baseProps.onApproveNewKey).not.toHaveBeenCalled();
  });

  it('calls onApproveNewKey when correct suffix is typed', () => {
    const { getByLabelText, getByPlaceholderText } = renderWithProviders(
      <PinMismatchScreen {...baseProps} />,
    );
    const suffix = OBSERVED_SPKI.slice(-8).toUpperCase();
    const input = getByPlaceholderText(suffix);
    fireEvent.changeText(input, suffix);
    fireEvent.press(getByLabelText('Approve new certificate key'));
    expect(baseProps.onApproveNewKey).toHaveBeenCalledWith(OBSERVED_SPKI);
  });
});
