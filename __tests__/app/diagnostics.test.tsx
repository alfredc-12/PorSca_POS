import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import DiagnosticsScreen from '@/app/diagnostics';
import { useAuth } from '@/src/context/AuthContext';
import { diagnostics } from '@/src/observability/diagnostics';
import { saleFailureCopy } from '@/src/domain/checkout';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
}));
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="diagnostics-redirect">{href}</Text>;
  },
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/context/AuthContext', () => ({ useAuth: jest.fn() }));

const useAuthMock = useAuth as jest.Mock;

describe('Diagnostics screen', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ isAdmin: true });
  });

  it('keeps the route closed to cashiers', () => {
    useAuthMock.mockReturnValue({ isAdmin: false });
    const screen = render(<DiagnosticsScreen />);
    expect(screen.getByTestId('diagnostics-redirect').props.children).toBe('/(tabs)/pos');
  });

  it('finds the raw detail behind a support code without printing it on a cashier screen', () => {
    const reference = diagnostics.record({
      reference: 'PRS-4K7Q2M',
      at: '2026-10-04T10:00:00.000Z',
      screen: 'cash-sale',
      status: 500,
      code: 'server_error',
      message: 'SQLSTATE[23000]: Integrity constraint violation',
      details: { exception: 'Illuminate\\Database\\QueryException' },
    }).reference;

    const screen = render(<DiagnosticsScreen />);
    expect(screen.getByTestId(`diagnostics-row-${reference}`)).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('diagnostics-code-input'), reference.toLowerCase());
    const detail = screen.getByTestId('diagnostics-detail');
    expect(detail).toHaveTextContent(/SQLSTATE\[23000\]/);
    expect(detail).toHaveTextContent(/Illuminate/);
    expect(detail).toHaveTextContent(/server_error/);
  });

  it('says so when a code has no record, and when nothing has failed yet', () => {
    const unknown = render(<DiagnosticsScreen />);
    fireEvent.changeText(unknown.getByTestId('diagnostics-code-input'), 'PRS-999999');
    expect(unknown.getByText('No record for that code')).toBeTruthy();
  });

  it('records the raw sale detail behind the code the cashier sees', () => {
    const described = saleFailureCopy({
      status: 500,
      code: 'server_error',
      message: 'The sale was not confirmed.',
      details: { exception: 'Illuminate\\Database\\QueryException', message: 'SQLSTATE[23000]: Integrity constraint violation' },
    });

    // Hidden from the cashier...
    expect(`${described.title} ${described.body}`).not.toMatch(/Illuminate|Exception|SQLSTATE/);
    expect(described.body).toContain('Check the connection');
    // ...but kept on the device, keyed by the code.
    const stored = diagnostics.find(described.reference!);
    expect(stored?.screen).toBe('cash-sale');
    expect(stored?.code).toBe('server_error');
    expect(JSON.stringify(stored?.details)).toContain('Illuminate');
  });
});
