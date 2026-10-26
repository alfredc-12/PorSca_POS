import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { CheckoutReasonModal } from './CheckoutReasonModal';

function props(overrides: Partial<React.ComponentProps<typeof CheckoutReasonModal>> = {}) {
  return {
    visible: true,
    title: 'Cancel this sale?',
    description: 'Reason is sent to the server.',
    submitLabel: 'Send cancellation',
    reason: '',
    onChangeReason: jest.fn(),
    onCancel: jest.fn(),
    onSubmit: jest.fn(),
    ...overrides,
  };
}

it('requires an attributed 8–500 character reason before submitting cancellation', () => {
  const modalProps = props({ reason: 'Too low' });
  render(<CheckoutReasonModal {...modalProps} />);

  expect(screen.getByRole('button', { name: 'Send cancellation' })).toBeDisabled();
  expect(screen.getByLabelText('Cancellation reason')).toBeTruthy();
  expect(screen.getByText('7/500 characters • at least 8 required')).toBeTruthy();
});

it('disables draft editing and repeat submission while sending', () => {
  render(<CheckoutReasonModal {...props({ reason: 'Customer changed mind', submitting: true })} />);

  expect(screen.getByLabelText('Cancellation reason')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
});
