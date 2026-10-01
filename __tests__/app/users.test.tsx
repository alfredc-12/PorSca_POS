import React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { apiClient, ApiClientError, ManagedUser } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import UsersScreen from '@/app/users';

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  function Redirect({ href }: { href: string }) {
    return React.createElement(Text, { testID: 'users-redirect' }, href);
  }
  return { Redirect, router: { back: jest.fn(), push: jest.fn() } };
});

jest.mock('@/src/context/AuthContext', () => ({ useAuth: jest.fn() }));

const admin: ManagedUser = { id: '1', name: 'Store Admin', email: 'admin@example.test', role: 'admin', is_active: true };
const cashier: ManagedUser = { id: '2', name: 'Counter One', email: 'cashier@example.test', role: 'cashier', is_active: true };
const useAuthMock = useAuth as jest.Mock;

function renderAdmin() {
  useAuthMock.mockReturnValue({ isAdmin: true });
  return render(<UsersScreen />);
}

beforeEach(() => {
  jest.restoreAllMocks();
  useAuthMock.mockReturnValue({ isAdmin: true });
  jest.spyOn(apiClient, 'listUsers').mockResolvedValue([admin, cashier]);
  jest.spyOn(apiClient, 'createCashier').mockResolvedValue({ ...cashier, id: '3', name: 'New Cashier', email: 'new@example.test' });
  jest.spyOn(apiClient, 'deactivateUser').mockResolvedValue(undefined);
  jest.spyOn(apiClient, 'updateUser').mockResolvedValue({ ...cashier, is_active: true });
});

describe('Users screen', () => {
  it('keeps the route closed to cashiers and makes no user API request', async () => {
    useAuthMock.mockReturnValue({ isAdmin: false });
    const screen = render(<UsersScreen />);

    expect(screen.getByTestId('users-redirect').props.children).toBe('/(tabs)/pos');
    expect(apiClient.listUsers).not.toHaveBeenCalled();
  });

  it('lists role and active state, requires a confirmation before deactivation, and supports reactivation', async () => {
    const screen = renderAdmin();
    await waitFor(() => expect(screen.getByTestId('user-row-2')).toBeTruthy());

    expect(within(screen.getByTestId('user-row-1')).getByText('Admin')).toBeTruthy();
    expect(within(screen.getByTestId('user-row-2')).getByText('Cashier')).toBeTruthy();
    expect(within(screen.getByTestId('user-row-2')).getByText('Active')).toBeTruthy();
    expect(screen.queryByTestId('deactivate-user-1')).toBeNull();

    fireEvent.press(screen.getByTestId('deactivate-user-2'));
    expect(screen.getByText('Deactivate Counter One?')).toBeTruthy();
    expect(apiClient.deactivateUser).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('confirm-deactivate-user-2'));
    await waitFor(() => expect(apiClient.deactivateUser).toHaveBeenCalledWith('2'));
    expect(within(screen.getByTestId('user-row-2')).getByText('Inactive')).toBeTruthy();

    fireEvent.press(screen.getByTestId('reactivate-user-2'));
    await waitFor(() => expect(apiClient.updateUser).toHaveBeenCalledWith('2', { is_active: true }));
    expect(within(screen.getByTestId('user-row-2')).getByText('Active')).toBeTruthy();
  });

  it('validates all cashier fields, then submits the exact create shape and displays the new account', async () => {
    const screen = renderAdmin();
    await waitFor(() => expect(screen.getByText('Counter One')).toBeTruthy());

    fireEvent.press(screen.getByTestId('create-cashier-button'));
    expect(screen.getByTestId('cashier-name-error').props.children).toBe('Enter the cashier’s name.');
    expect(screen.getByTestId('cashier-email-error').props.children).toBe('Enter an email address.');
    expect(screen.getByTestId('cashier-password-error').props.children).toBe('Password must be at least 8 characters.');
    expect(apiClient.createCashier).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('cashier-name-input'), 'New Cashier');
    fireEvent.changeText(screen.getByTestId('cashier-email-input'), 'new@example.test');
    fireEvent.changeText(screen.getByTestId('cashier-password-input'), 'secure-pass');
    fireEvent.press(screen.getByTestId('create-cashier-button'));

    await waitFor(() => expect(apiClient.createCashier).toHaveBeenCalledWith({
      name: 'New Cashier', email: 'new@example.test', password: 'secure-pass',
    }));
    expect(await screen.findByTestId('user-row-3')).toBeTruthy();
    expect(screen.getByText('New Cashier')).toBeTruthy();
  });

  it('keeps server validation errors visible and attached to the relevant field', async () => {
    jest.spyOn(apiClient, 'createCashier').mockRejectedValueOnce(new ApiClientError(
      'The email has already been taken.',
      422,
      'validation_error',
      { email: ['The email has already been taken.'] },
    ));
    const screen = renderAdmin();
    await waitFor(() => expect(screen.getByText('Counter One')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('cashier-name-input'), 'Another Cashier');
    fireEvent.changeText(screen.getByTestId('cashier-email-input'), 'taken@example.test');
    fireEvent.changeText(screen.getByTestId('cashier-password-input'), 'secure-pass');
    fireEvent.press(screen.getByTestId('create-cashier-button'));

    expect(await screen.findByTestId('users-create-error')).toBeTruthy();
    expect(screen.getByTestId('cashier-email-error').props.children).toBe('The email has already been taken.');
  });
});
