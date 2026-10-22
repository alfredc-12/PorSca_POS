import React from 'react';
import { render } from '@testing-library/react-native';
import { KeyboardAvoidingView } from 'react-native';
import ProductFormScreen from '@/app/product-form';

jest.mock('expo-router', () => ({
  Redirect: () => null,
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/src/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }));
jest.mock('@/src/context/PosContext', () => ({ usePos: () => ({ products: [], inventoryProducts: [] }) }));
jest.mock('@/src/components/ProductEditor', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ProductEditor: () => <View testID="product-editor" /> };
});

describe('Product form keyboard shell', () => {
  it('uses one shared keyboard-avoiding wrapper around the product editor', () => {
    const { getByTestId, queryByTestId, UNSAFE_getAllByType } = render(<ProductFormScreen />);

    expect(UNSAFE_getAllByType(KeyboardAvoidingView)).toHaveLength(1);
    expect(getByTestId('product-editor')).toBeTruthy();
    expect(queryByTestId('screen-scroll')).toBeNull();
  });
});
