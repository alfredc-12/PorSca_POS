import React, { useState } from 'react';
import { Button, Text, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiClient, ApiClientError } from '@/src/api/client';
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
