import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { ApiClient } from '@/src/api/client';
import { PosProvider, usePos } from '@/src/context/PosContext';
import { seedProducts } from '@/src/data/mockProducts';

const offlineClient = { isConfigured: false } as unknown as ApiClient;

function wrapperFor(demoCatalogEnabled: boolean) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <PosProvider client={offlineClient} demoCatalogEnabled={demoCatalogEnabled}>{children}</PosProvider>;
  };
}

describe('offline policy with the demo catalog off (default)', () => {
  it('starts with no substituted catalog or inventory', () => {
    const { result } = renderHook(() => usePos(), { wrapper: wrapperFor(false) });

    expect(result.current.products).toEqual([]);
    expect(result.current.inventoryProducts).toEqual([]);
    expect(result.current.demoCatalogEnabled).toBe(false);
  });

  it('returns no search rows and says so instead of showing demo products', async () => {
    const { result } = renderHook(() => usePos(), { wrapper: wrapperFor(false) });

    await act(async () => {
      await result.current.searchProducts('Coca-Cola');
    });

    expect(result.current.searchResults).toEqual([]);
    expect(result.current.catalogUsingFallback).toBe(false);
    expect(result.current.catalogState).toBe('unavailable');
    expect(result.current.catalogError).toContain('not connected to the shop server yet');
  });

  it('refuses a barcode lookup rather than inventing a demo product', async () => {
    const { result } = renderHook(() => usePos(), { wrapper: wrapperFor(false) });

    let lookup: Awaited<ReturnType<typeof result.current.lookupProductByBarcode>> | undefined;
    await act(async () => {
      lookup = await result.current.lookupProductByBarcode('4800010000011');
    });

    expect(lookup).toMatchObject({ ok: false, status: 'unavailable' });
    expect(lookup?.usingFallback).toBeUndefined();
  });

  it('keeps the cart editable but refuses to record a sale without Laravel', async () => {
    const { result } = renderHook(() => usePos(), { wrapper: wrapperFor(false) });

    act(() => {
      result.current.addProductChecked({ ...seedProducts[0], stock: 5 });
    });
    expect(result.current.cart).toHaveLength(1);
    expect(result.current.total).toBe(25);

    await act(async () => {
      await expect(result.current.completeCashSale(100)).rejects.toThrow(/No sale was recorded and stock was not changed/);
    });

    expect(result.current.sales).toEqual([]);
    // The cart survives the refusal so the cashier can reconnect and retry.
    expect(result.current.cart).toHaveLength(1);
  });

  it('reports an empty inventory instead of seeding one', async () => {
    const { result } = renderHook(() => usePos(), { wrapper: wrapperFor(false) });

    await act(async () => {
      await result.current.refreshInventory();
    });

    expect(result.current.inventoryProducts).toEqual([]);
    expect(result.current.inventoryUsingFallback).toBe(false);
  });
});

describe('offline policy with the demo catalog explicitly enabled', () => {
  it('substitutes the demo catalog for reads but never records a local sale', async () => {
    const { result } = renderHook(() => usePos(), { wrapper: wrapperFor(true) });

    expect(result.current.products).toHaveLength(seedProducts.length);

    await act(async () => {
      await result.current.searchProducts('Coca-Cola');
    });
    expect(result.current.catalogUsingFallback).toBe(true);
    expect(result.current.searchResults[0].name).toContain('Coca-Cola');

    await act(async () => {
      result.current.addProductChecked({ ...seedProducts[0], stock: 5 });
    });
    await act(async () => {
      await expect(result.current.completeCashSale(100)).rejects.toThrow(/No sale was recorded and stock was not changed/);
    });

    // A demo catalog substitutes reads only. It can never produce a paid sale
    // that Laravel never saw, so no local sale is recorded and the cart is kept
    // (defect F1).
    expect(result.current.sales).toEqual([]);
    expect(result.current.cart).toHaveLength(1);
  });
});
