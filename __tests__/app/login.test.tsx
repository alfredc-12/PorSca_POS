import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import LoginScreen from '@/app/login';

const mockSignIn = jest.fn();
const mockRetry = jest.fn();
const mockSignOut = jest.fn();
let mockStatus = 'signed-out';
let mockSessionError: string | undefined;

jest.mock('@/src/context/AuthContext', () => ({
  useAuth: () => ({ status: mockStatus, signIn: mockSignIn, sessionError: mockSessionError, retrySession: mockRetry, signOut: mockSignOut }),
}));
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>{href}</Text>;
  },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

function fill(screen: ReturnType<typeof render>) {
  fireEvent.changeText(screen.getByLabelText('Email'), 'cashier@example.test');
  fireEvent.changeText(screen.getByLabelText('Password'), 'password');
}

describe('login screen', () => {
  beforeEach(() => {
    mockStatus = 'signed-out';
    mockSessionError = undefined;
    mockSignIn.mockReset().mockResolvedValue(undefined);
    mockRetry.mockReset();
    mockSignOut.mockReset();
  });

  it('requires email and password and keeps the password masked', () => {
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address and your password.')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });

  it('submits once, disables the form while waiting, and clears the password on success', async () => {
    let resolve!: () => void;
    mockSignIn.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    const screen = render(<LoginScreen />);
    fill(screen);
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    fireEvent(screen.getByLabelText('Password'), 'submitEditing');
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignIn).toHaveBeenCalledWith('cashier@example.test', 'password');
    expect(screen.getByLabelText('Password').props.editable).toBe(false);
    await act(async () => { resolve(); });
    expect(screen.getByLabelText('Password').props.value).toBe('');
  });

  it.each(['The provided credentials are incorrect.', 'Too many requests.', 'Unable to reach PorSca API: offline'])('shows a recoverable login failure: %s', async (message) => {
    mockSignIn.mockRejectedValue(new Error(message));
    const screen = render(<LoginScreen />);
    fill(screen);
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
    expect(screen.getByLabelText('Email').props.value).toBe('cashier@example.test');
    expect(screen.getByLabelText('Password').props.editable).toBe(true);
  });

  it('offers retry/forget for failed session restoration', () => {
    mockSessionError = 'Network unavailable';
    const screen = render(<LoginScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Retry saved session' }));
    expect(mockRetry).toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Forget saved session' }));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('does not show credentials while restoring or when already signed in', () => {
    mockStatus = 'loading';
    const screen = render(<LoginScreen />);
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByText('Checking your session…')).toBeTruthy();
    mockStatus = 'signed-in';
    screen.rerender(<LoginScreen />);
    expect(screen.getByText('/(tabs)/pos')).toBeTruthy();
  });
});
