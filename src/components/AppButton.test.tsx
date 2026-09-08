import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { AppButton } from '@/src/components/AppButton';

describe('AppButton', () => {
  it('exposes a button and invokes the action when enabled', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<AppButton label="Confirm payment" onPress={onPress} />);
    const button = getByRole('button', { name: 'Confirm payment' });

    fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.props.accessibilityState).toEqual({ disabled: false });
  });

  it('does not invoke the action when disabled and exposes the disabled state', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<AppButton label="Confirm payment" onPress={onPress} disabled />);
    const button = getByRole('button', { name: 'Confirm payment' });

    fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toEqual({ disabled: true });
  });
});
