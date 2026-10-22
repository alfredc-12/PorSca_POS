import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/src/components/Screen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

type KeyboardShowEvent = { endCoordinates: { screenY: number } };
const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
}

function captureKeyboardDidShow() {
  const listeners: ((event: KeyboardShowEvent) => void)[] = [];
  jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
    if (eventName === 'keyboardDidShow') listeners.push(listener as (event: KeyboardShowEvent) => void);
    return { remove: jest.fn() } as never;
  });
  return listeners;
}

function mockScrollGeometry(scrollView: ScrollView) {
  const scrollTo = jest.fn();
  scrollView.getNativeScrollRef = jest.fn(() => ({
    measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 0, 360, 600),
  } as never));
  scrollView.scrollTo = scrollTo;
  return scrollTo;
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

  it('scrolls the focused input by its keyboard overlap plus 16 points', () => {
    setPlatform('android');
    const listeners = captureKeyboardDidShow();
    const focusedInput = { measureInWindow: jest.fn((callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 470, 160, 40)) };
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(focusedInput as never);

    const { getByTestId, UNSAFE_getByType } = render(<Screen><TextInput testID="focused-input" /></Screen>);
    const scrollView = UNSAFE_getByType(ScrollView).instance as ScrollView;
    const scrollTo = mockScrollGeometry(scrollView);

    fireEvent.scroll(getByTestId('screen-scroll'), { nativeEvent: { contentOffset: { x: 0, y: 42 } } });
    act(() => listeners.forEach((listener) => listener({ endCoordinates: { screenY: 500 } })));

    expect(focusedInput.measureInWindow).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 68, animated: true });
  });

  it('does not scroll when the focused input is already clear of the keyboard', () => {
    setPlatform('android');
    const listeners = captureKeyboardDidShow();
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue({
      measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 400, 160, 40),
    } as never);

    const { UNSAFE_getByType } = render(<Screen><TextInput /></Screen>);
    const scrollTo = mockScrollGeometry(UNSAFE_getByType(ScrollView).instance as ScrollView);

    act(() => listeners.forEach((listener) => listener({ endCoordinates: { screenY: 500 } })));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('renders exactly one keyboard-avoiding wrapper and one scroll surface', () => {
    setPlatform('ios');
    const { getAllByTestId } = render(<Screen><View /></Screen>);

    expect(getAllByTestId('screen-keyboard-avoiding')).toHaveLength(1);
    expect(getAllByTestId('screen-scroll')).toHaveLength(1);
  });
});
