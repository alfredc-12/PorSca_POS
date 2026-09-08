import React, { useState } from 'react';
import { Button, Text, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiClient, ApiClientError, Payment } from '@/src/api/client';
import { PosProvider, usePos } from '@/src/context/PosContext';
import { Sale } from '@/src/types';

const sale: Sale = {
  id: 'sale-1',
  createdAt: '2026-09-08T12:00:00Z',
  total: 25,
  paymentMethod: 'cash',
  status: 'paid',
  cashReceived: 100,
  change: 75,
  items: [{ product: { id: 'prd-001', barcode: '4800010000011', name: 'Coca-Cola 500mL', price: 25, stock: 48 }, quantity: 1 }],
};

function Harness() {
  const { products, cart, sales, addProductChecked, completeCashSale } = usePos();
  const [result, setResult] = useState('');
  const product = products[0];

  return (
    <View>
      <Button testID="add-product" title="Add product" onPress={() => addProductChecked(product)} />
      <Button
        testID="complete-sale"
        title="Complete sale"
        onPress={() => {
          void completeCashSale(100).then(() => setResult('completed')).catch((error: Error) => setResult(error.message));
        }}
      />
      <Text>{`cart:${cart.length} sales:${sales.length} result:${result}`}</Text>
    </View>
  );
}

function QrHarness() {
  const { products, addProductChecked, startQrPhPayment } = usePos();
  const [result, setResult] = useState('');

  return (
    <View>
      <Button testID="add-qr-product" title="Add QR product" onPress={() => addProductChecked(products[0])} />
      <Button
        testID="start-qr"
        title="Start QR"
        onPress={() => {
          void startQrPhPayment().then(() => setResult('created')).catch((error: Error) => setResult(error.message));
        }}
      />
      <Text>{`qr-result:${result}`}</Text>
    </View>
  );
}

function makeClient(createSale: jest.Mock) {
  return {
    isConfigured: true,
    createSale,
    listInventory: jest.fn().mockResolvedValue([{
      productId: 'prd-001',
      sku: 'COLA-001',
      barcode: '4800010000011',
      productName: 'Coca-Cola 500mL',
      quantity: 47,
      reorderLevel: 5,
      status: 'in_stock',
    }]),
    listProducts: jest.fn().mockResolvedValue([{
      id: 'prd-001',
      sku: 'COLA-001',
      barcode: '4800010000011',
      name: 'Coca-Cola 500mL',
      price: 2500,
      stock: { quantity: 47, reorder_level: 5, status: 'in_stock' },
    }]),
    listSales: jest.fn().mockResolvedValue([sale]),
  } as unknown as ApiClient;
}

function makeQrClient(createQrPhPayment: jest.Mock) {
  return {
    isConfigured: true,
    createQrPhPayment,
  } as unknown as ApiClient;
}

const pendingPayment: Payment = { id: 'payment-1', status: 'pending', amount: 2500 };

describe('PosProvider Laravel cash checkout', () => {
  it('uses one idempotent request for concurrent retries and refreshes backend history/inventory', async () => {
    const createSale = jest.fn().mockResolvedValue(sale);
    const client = makeClient(createSale);
    const { getByTestId, getByText } = render(
      <PosProvider client={client}><Harness /></PosProvider>,
    );

    fireEvent.press(getByTestId('add-product'));
    await act(async () => {
      fireEvent.press(getByTestId('complete-sale'));
      fireEvent.press(getByTestId('complete-sale'));
    });

    await waitFor(() => expect(getByText('cart:0 sales:1 result:completed')).toBeTruthy());
    expect(createSale).toHaveBeenCalledTimes(1);
    expect(createSale.mock.calls[0][0]).toMatchObject({
      paymentMethod: 'cash',
      cashReceived: 10000,
      total: 2500,
      items: [{ productId: 'prd-001', quantity: 1, unitPrice: 2500 }],
    });
    expect(client.listInventory).toHaveBeenCalledTimes(1);
    expect(client.listProducts).toHaveBeenCalledTimes(1);
    expect(client.listSales).toHaveBeenCalledTimes(1);
  });

  it('retains the idempotency key after a transport error so a retry is safe', async () => {
    const createSale = jest.fn()
      .mockRejectedValueOnce(new ApiClientError('Unable to reach PorSca API: timeout'))
      .mockResolvedValueOnce(sale);
    const { getByTestId, getByText } = render(
      <PosProvider client={makeClient(createSale)}><Harness /></PosProvider>,
    );

    fireEvent.press(getByTestId('add-product'));
    await act(async () => {
      fireEvent.press(getByTestId('complete-sale'));
    });
    await waitFor(() => expect(getByText(/result:Unable to reach PorSca API: timeout/)).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId('complete-sale'));
    });
    await waitFor(() => expect(getByText('cart:0 sales:1 result:completed')).toBeTruthy());

    expect(createSale).toHaveBeenCalledTimes(2);
    expect(createSale.mock.calls[0][0].idempotencyKey).toBe(createSale.mock.calls[1][0].idempotencyKey);
  });
});

describe('PosProvider Laravel QR Ph checkout', () => {
  it('uses one Laravel payment request for concurrent starts and preserves its key', async () => {
    const createQrPhPayment = jest.fn().mockResolvedValue(pendingPayment);
    const { getByTestId, getByText } = render(
      <PosProvider client={makeQrClient(createQrPhPayment)}><QrHarness /></PosProvider>,
    );

    fireEvent.press(getByTestId('add-qr-product'));
    await act(async () => {
      fireEvent.press(getByTestId('start-qr'));
      fireEvent.press(getByTestId('start-qr'));
    });

    await waitFor(() => expect(getByText('qr-result:created')).toBeTruthy());
    expect(createQrPhPayment).toHaveBeenCalledTimes(1);
    expect(createQrPhPayment.mock.calls[0][0]).toMatchObject({
      items: [{ productId: 'prd-001', quantity: 1 }],
    });
    expect(createQrPhPayment.mock.calls[0][0].idempotencyKey).toMatch(/^mobile-qr-/);
  });

  it('retries a transport failure with the same idempotency key rather than creating a new completion', async () => {
    const createQrPhPayment = jest.fn()
      .mockRejectedValueOnce(new ApiClientError('Unable to reach PorSca API: timeout'))
      .mockResolvedValueOnce(pendingPayment);
    const { getByTestId, getByText } = render(
      <PosProvider client={makeQrClient(createQrPhPayment)}><QrHarness /></PosProvider>,
    );

    fireEvent.press(getByTestId('add-qr-product'));
    await act(async () => {
      fireEvent.press(getByTestId('start-qr'));
    });
    await waitFor(() => expect(getByText(/qr-result:Unable to reach PorSca API: timeout/)).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId('start-qr'));
    });
    await waitFor(() => expect(getByText('qr-result:created')).toBeTruthy());

    expect(createQrPhPayment).toHaveBeenCalledTimes(2);
    expect(createQrPhPayment.mock.calls[0][0].idempotencyKey).toBe(createQrPhPayment.mock.calls[1][0].idempotencyKey);
  });
});
