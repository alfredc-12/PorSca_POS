import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { QrExpiryCountdown } from './QrExpiryCountdown';

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]),
}));

let appStateListener: ((state: AppStateStatus) => void) | undefined;
const removeListener = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-23T12:00:00.000Z'));
  appStateListener = undefined;
  removeListener.mockClear();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener;
    return { remove: removeListener };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('QR expiry countdown', () => {
  it('counts down from the server timestamp and clamps at 00:00', () => {
    const view = render(<QrExpiryCountdown expiresAt="2026-10-23T12:00:03.000Z" />);
    expect(view.getByTestId('qr-expiry-countdown')).toHaveTextContent('Time remaining: 00:03');
    expect(view.getByTestId('qr-expiry-countdown')).toHaveProp('accessibilityLabel', 'QR time remaining 00:03');

    act(() => { jest.advanceTimersByTime(1000); });
    expect(view.getByTestId('qr-expiry-countdown')).toHaveTextContent('Time remaining: 00:02');
    act(() => { jest.advanceTimersByTime(3000); });
    expect(view.getByTestId('qr-expiry-countdown')).toHaveTextContent('Time remaining: 00:00');
  });

  it('refreshes immediately when the app resumes after the server expiry time', () => {
    const view = render(<QrExpiryCountdown expiresAt="2026-10-23T12:00:20.000Z" />);
    expect(view.getByTestId('qr-expiry-countdown')).toHaveTextContent('Time remaining: 00:20');

    act(() => { appStateListener?.('background'); });
    jest.setSystemTime(new Date('2026-10-23T12:00:30.000Z'));
    act(() => { appStateListener?.('active'); });

    expect(view.getByTestId('qr-expiry-countdown')).toHaveTextContent('Time remaining: 00:00');
  });

  it.each([null, undefined, 'not-an-expiry'])('shows a neutral fallback for missing or invalid expiry %s', expiresAt => {
    const view = render(<QrExpiryCountdown expiresAt={expiresAt} />);
    expect(view.getByTestId('qr-expiry-countdown')).toHaveTextContent('Expiry time unavailable');
    expect(view.getByTestId('qr-expiry-countdown')).toHaveProp('accessibilityLabel', 'QR expiry time unavailable');
  });

  it('removes its app-state subscription and timer when unmounted', () => {
    const view = render(<QrExpiryCountdown expiresAt="2026-10-23T12:01:00.000Z" />);
    view.unmount();
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
