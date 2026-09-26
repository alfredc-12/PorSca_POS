import { act, renderHook, waitFor } from '@testing-library/react-native';
import { BarcodeLookupResult } from '@/src/domain/barcode';
import { useBarcodeScan } from '@/src/hooks/useBarcodeScan';
import { EAN13_IN_STOCK, UNKNOWN_BARCODE } from '@/src/data/barcodeFixtures';

const cola = { id: 'prd-1', barcode: EAN13_IN_STOCK, name: 'Coca-Cola 500mL', price: 25, stock: 48 };

describe('useBarcodeScan session', () => {
  it('resolves one scanned value into a single outcome and suspends scanning', async () => {
    const resolve = jest.fn().mockResolvedValue({
      ok: true,
      product: cola,
      status: 'found',
      message: 'Coca-Cola 500mL added to cart.',
    } satisfies BarcodeLookupResult);
    const { result } = renderHook(() => useBarcodeScan({ resolve }));

    expect(result.current.scanning).toBe(true);
    act(() => result.current.handleBarcode(EAN13_IN_STOCK));

    await waitFor(() => expect(result.current.outcome).toBeDefined());
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(EAN13_IN_STOCK);
    expect(result.current.outcome).toMatchObject({ kind: 'found', product: cola });
    expect(result.current.busy).toBe(false);
    expect(result.current.scanning).toBe(false);
  });

  it('re-arms only on an explicit rearm so a failed scan cannot refire itself', async () => {
    const resolve = jest.fn().mockResolvedValue({
      ok: false,
      status: 'not-found',
      message: 'No product was found for this barcode.',
    } satisfies BarcodeLookupResult);
    const { result } = renderHook(() => useBarcodeScan({ resolve }));

    act(() => result.current.handleBarcode(UNKNOWN_BARCODE));
    await waitFor(() => expect(result.current.outcome?.kind).toBe('not-found'));
    expect(result.current.scanning).toBe(false);

    act(() => result.current.rearm());
    expect(result.current.outcome).toBeUndefined();
    expect(result.current.scanning).toBe(true);
  });

  it('never leaves the session stuck when the resolver rejects', async () => {
    const resolve = jest.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useBarcodeScan({ resolve }));

    act(() => result.current.handleBarcode(EAN13_IN_STOCK));

    await waitFor(() => expect(result.current.outcome?.kind).toBe('error'));
    expect(result.current.busy).toBe(false);
    expect(result.current.scanning).toBe(false);
  });

  it('reports a superseded resolver without restarting the session', async () => {
    const first = jest.fn().mockResolvedValue({
      ok: false,
      status: 'not-found',
      message: 'missing',
    } satisfies BarcodeLookupResult);
    const { result, rerender } = renderHook(
      ({ resolve }: { resolve: (barcode: string) => Promise<BarcodeLookupResult> }) => useBarcodeScan({ resolve }),
      { initialProps: { resolve: first } },
    );

    rerender({ resolve: first });
    act(() => result.current.handleBarcode(UNKNOWN_BARCODE));

    await waitFor(() => expect(result.current.outcome?.kind).toBe('not-found'));
    expect(first).toHaveBeenCalledTimes(1);
  });
});
