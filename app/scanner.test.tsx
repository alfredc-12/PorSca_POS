import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiClient } from '@/src/api/client';
import ScannerScreen from '@/app/scanner';
import { PosProvider } from '@/src/context/PosContext';

const mockRouter = { back: jest.fn(), replace: jest.fn() };
let mockRouteParams: { mode?: string } = { mode: 'inventory' };

jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    back: (...args: unknown[]) => mockRouter.back(...args),
    replace: (...args: unknown[]) => mockRouter.replace(...args),
  },
  useLocalSearchParams: () => mockRouteParams,
}));

jest.mock('expo-camera', () => {
  const mockReact = jest.requireActual('react');
  const mockReactNative = jest.requireActual('react-native');
  return {
    CameraView: (props: { onBarcodeScanned?: (event: { data: string }) => void }) => mockReact.createElement(mockReactNative.View, { testID: 'camera-view', onBarcodeScanned: props.onBarcodeScanned }),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

describe('ScannerScreen', () => {
  beforeEach(() => {
    mockRouteParams = { mode: 'inventory' };
    mockRouter.back.mockReset();
    mockRouter.replace.mockReset();
  });

  it('carries an unknown inventory barcode into product creation', async () => {
    const barcode = '4800000000066';
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'not_found', message: 'Product not found for this barcode.' } }),
    } as Response);
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = render(
      <PosProvider client={client}>
        <ScannerScreen />
      </PosProvider>,
    );

    fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data: barcode });

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(
      'Barcode not in inventory',
      expect.stringContaining('add it as a new product'),
      expect.any(Array),
    ));
    const actions = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    actions.find((action) => action.text === 'Add product')?.onPress?.();
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/product-form', params: { barcode } });
    alertSpy.mockRestore();
  });
});
