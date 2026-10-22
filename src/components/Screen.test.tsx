import React from 'react';
import { render } from '@testing-library/react-native';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/src/components/Screen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
}

afterEach(() => {
  if (originalPlatformDescriptor) Object.defineProperty(Platform, 'OS', originalPlatformDescriptor);
  jest.restoreAllMocks();
});

describe('Screen keyboard avoidance', () => {
  it('uses iOS keyboard insets and interactive dismissal without enabling the avoiding view', () => {
    setPlatform('ios');
    const { getByTestId, UNSAFE_getByType } = render(<Screen><Text>Screen content</Text></Screen>);

    const avoiding = UNSAFE_getByType(KeyboardAvoidingView).props;
    const scroll = getByTestId('screen-scroll').props;
    expect(avoiding.enabled).toBe(false);
    expect(avoiding.behavior).toBe('padding');
    expect(StyleSheet.flatten(avoiding.style)).toMatchObject({ flex: 1 });
    expect(scroll.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(scroll.keyboardDismissMode).toBe('interactive');
    expect(scroll.keyboardShouldPersistTaps).toBe('handled');
    expect(scroll.scrollEventThrottle).toBe(16);
  });

  it('uses Android keyboard avoidance and drag dismissal', () => {
    setPlatform('android');
    const { getByTestId, UNSAFE_getByType } = render(<Screen><Text>Screen content</Text></Screen>);

    const avoiding = UNSAFE_getByType(KeyboardAvoidingView).props;
    const scroll = getByTestId('screen-scroll').props;
    expect(avoiding.enabled).toBe(true);
    expect(avoiding.behavior).toBe('padding');
    expect(scroll.automaticallyAdjustKeyboardInsets).toBe(false);
    expect(scroll.keyboardDismissMode).toBe('on-drag');
    expect(scroll.keyboardShouldPersistTaps).toBe('handled');
    expect(scroll.scrollEventThrottle).toBe(16);
  });

  it('keeps the keyboard-avoiding shell but omits the scroll surface when scrolling is disabled', () => {
    setPlatform('android');
    const { queryByTestId, getByText, UNSAFE_getByType } = render(<Screen scroll={false}><Text>Fixed content</Text></Screen>);

    expect(UNSAFE_getByType(KeyboardAvoidingView).props.enabled).toBe(true);
    expect(queryByTestId('screen-scroll')).toBeNull();
    expect(getByText('Fixed content')).toBeTruthy();
  });

  it('renders exactly one keyboard-avoiding wrapper and one scroll surface', () => {
    setPlatform('ios');
    const { getAllByTestId } = render(<Screen><View /></Screen>);

    expect(getAllByTestId('screen-keyboard-avoiding')).toHaveLength(1);
    expect(getAllByTestId('screen-scroll')).toHaveLength(1);
  });
});
