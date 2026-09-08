import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { DataState } from '@/src/components/DataState';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

describe('DataState', () => {
  it('shows a loading state without pretending data is ready', () => {
    const { getByText } = render(
      <DataState kind="loading" title="Loading inventory from Laravel" message="Fetching current stock." />,
    );

    expect(getByText('Loading inventory from Laravel')).toBeTruthy();
  });

  it('shows an unavailable recovery action', () => {
    const onRetry = jest.fn();
    const { getByText, getByRole } = render(
      <DataState
        kind="unavailable"
        title="Laravel catalog unavailable"
        message="The API could not be reached."
        actionLabel="Retry search"
        onAction={onRetry}
      />,
    );

    expect(getByText('The API could not be reached.')).toBeTruthy();
    fireEvent.press(getByRole('button', { name: 'Retry search' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows no-results copy and a recovery action', () => {
    const onClear = jest.fn();
    const { getByText, getByRole } = render(
      <DataState kind="no-results" title="No matching product" message="Try a different name or barcode." actionLabel="Clear search" onAction={onClear} />,
    );

    expect(getByText('No matching product')).toBeTruthy();
    fireEvent.press(getByRole('button', { name: 'Clear search' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
