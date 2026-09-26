import { act, renderHook, waitFor } from '@testing-library/react-native';
import { BarcodeLookupResult, BarcodeResolver } from '@/src/domain/barcode';
import { SAME_BARCODE_COOLDOWN_MS, useBarcodeScan } from '@/src/hooks/useBarcodeScan';
import {
  EAN13_IN_STOCK,
  EAN13_OUT_OF_STOCK,
  GS1_EXAMPLE_INVALID,
  GS1_EXAMPLE_VALID,
  MALFORMED_LONG_CODE,
  MALFORMED_SHORT_CODE,
  NON_PRODUCT_CODE,
  UNKNOWN_BARCODE,
} from '@/src/data/barcodeFixtures';

const cola = { id: 'prd-1', barcode: EAN13_IN_STOCK, name: 'Coca-Cola 500mL', price: 25, stock: 48 };

function found(overrides: Partial<BarcodeLookupResult> = {}): BarcodeLookupResult {
  return { ok: true, product: cola, status: 'found', message: 'Coca-Cola 500mL added to cart.', quantity: 1, ...overrides };
}

function notFound(): BarcodeLookupResult {
  return { ok: false, status: 'not-found', message: 'No product matches.' };
}

function fakeClock(start = 1_000_000) {
  const state = { t: start };
  return { now: () => state.t, advance: (ms: number) => { state.t += ms; } };
}

/**
 * The camera case set from the week-6 test plan, driven through the scanner
 * seam so no device or camera binding is involved.
 */
describe('useBarcodeScan camera cases', () => {
  it('S1/S2: stays disarmed until the camera is ready, and ignores callbacks before then', async () => {
    const resolve = jest.fn().mockResolvedValue(found());
    const { result, rerender } = renderHook(
      ({ cameraReady }: { cameraReady: boolean }) => useBarcodeScan({ resolve, cameraReady }),
      { initialProps: { cameraReady: false } },
    );

    expect(result.current.scanning).toBe(false);
    act(() => result.current.handleBarcode(EAN13_IN_STOCK));
    expect(resolve).not.toHaveBeenCalled();

    rerender({ cameraReady: true });
    expect(result.current.scanning).toBe(true);
  });

  it('S3: one lookup when several native callbacks arrive in the same tick', async () => {
    const resolve = jest.fn().mockResolvedValue(found());
    const { result } = renderHook(() => useBarcodeScan({ resolve }));

    act(() => {
      result.current.handleBarcode(EAN13_IN_STOCK);
      result.current.handleBarcode(EAN13_IN_STOCK);
      result.current.handleBarcode(EAN13_IN_STOCK);
    });

    await waitFor(() => expect(result.current.outcome).toBeDefined());
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('S4: a five-second exposure produces exactly one answer', async () => {
    const clock = fakeClock();
    const resolve = jest.fn().mockResolvedValue(found());
    const { result } = renderHook(() => useBarcodeScan({ resolve, now: clock.now }));

    for (let elapsed = 0; elapsed < 5000; elapsed += 250) {
      act(() => result.current.handleBarcode(EAN13_IN_STOCK));
      clock.advance(250);
      await act(async () => { await Promise.resolve(); });
    }

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(result.current.outcome?.kind).toBe('found');
  });

  it('S5: an explicit retry still suppresses the same symbol inside the cooldown, then accepts it', async () => {
    const clock = fakeClock();
    const resolve = jest.fn().mockResolvedValue(notFound());
    const { result } = renderHook(() => useBarcodeScan({ resolve, now: clock.now }));

    act(() => result.current.handleBarcode(UNKNOWN_BARCODE));
    await waitFor(() => expect(result.current.outcome?.kind).toBe('not-found'));

    act(() => result.current.rearm());
    expect(result.current.scanning).toBe(true);

    act(() => result.current.handleBarcode(UNKNOWN_BARCODE));
    clock.advance(SAME_BARCODE_COOLDOWN_MS - 1);
    expect(resolve).toHaveBeenCalledTimes(1);

    clock.advance(1);
    act(() => result.current.handleBarcode(UNKNOWN_BARCODE));
    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(2));
  });

  it('S6: the cooldown is per symbol, so the next product scans immediately', async () => {
    const clock = fakeClock();
    const resolve = jest.fn().mockResolvedValue(found());
    const { result } = renderHook(() => useBarcodeScan({ resolve, now: clock.now }));

    act(() => result.current.handleBarcode(EAN13_IN_STOCK));
    await waitFor(() => expect(result.current.outcome?.kind).toBe('found'));

    act(() => result.current.rearm());
    act(() => result.current.handleBarcode(GS1_EXAMPLE_VALID));
    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(2));
  });

  it.each([
    ['a non-numeric symbol', NON_PRODUCT_CODE],
    ['a short code', MALFORMED_SHORT_CODE],
    ['an over-long code', MALFORMED_LONG_CODE],
  ])('S7: rejects %s locally without a request', async (_label, barcode) => {
    const resolve = jest.fn().mockResolvedValue(found());
    const { result } = renderHook(() => useBarcodeScan({ resolve }));

    act(() => result.current.handleBarcode(barcode));

    await waitFor(() => expect(result.current.outcome?.kind).toBe('invalid'));
    expect(resolve).not.toHaveBeenCalled();
    expect(result.current.scanning).toBe(false);
  });

  it('S8: an unknown code names the misread risk when the check digit fails', async () => {
    const resolve = jest.fn().mockResolvedValue(notFound());
    const { result } = renderHook(() => useBarcodeScan({ resolve }));

    act(() => result.current.handleBarcode(GS1_EXAMPLE_INVALID));

    await waitFor(() => expect(result.current.outcome?.kind).toBe('not-found'));
    expect(result.current.outcome?.checkDigitValid).toBe(false);
    expect(result.current.outcome?.message).toContain('check digit is invalid');
    expect(result.current.outcome?.message).toContain(GS1_EXAMPLE_INVALID);
  });

  it('S9: an unknown code with a valid check digit keeps the plain recovery copy', async () => {
    const resolve = jest.fn().mockResolvedValue(notFound());
    const { result } = renderHook(() => useBarcodeScan({ resolve }));

    act(() => result.current.handleBarcode(GS1_EXAMPLE_VALID));

    await waitFor(() => expect(result.current.outcome?.kind).toBe('not-found'));
    expect(result.current.outcome?.checkDigitValid).toBe(true);
    expect(result.current.outcome?.message).toContain('add the product from Inventory');
  });

  it('S10: passes the resolved product and cart quantity through the session', async () => {
    const resolve = jest.fn().mockResolvedValue(found({ quantity: 3 }));
    const { result } = renderHook(() => useBarcodeScan({ resolve }));

    act(() => result.current.handleBarcode(EAN13_IN_STOCK));

    await waitFor(() => expect(result.current.outcome?.kind).toBe('found'));
    expect(result.current.outcome).toMatchObject({
      barcode: EAN13_IN_STOCK,
      product: cola,
      quantity: 3,
      title: 'Product found',
    });
  });

  it.each([
    ['out-of-stock', 'Out of stock', 'Coca-Cola 500mL has no stock left.'],
    ['limit-reached', 'Stock limit reached', 'No more stock is available for this item.'],
  ] as const)('S11: reports %s with its own headline', async (status, title, message) => {
    const resolve = jest.fn().mockResolvedValue({ ok: false, product: cola, status, message } satisfies BarcodeLookupResult);
    const { result } = renderHook(() => useBarcodeScan({ resolve }));

    act(() => result.current.handleBarcode(EAN13_OUT_OF_STOCK));

    await waitFor(() => expect(result.current.outcome?.kind).toBe(status));
    expect(result.current.outcome?.title).toBe(title);
    expect(result.current.outcome?.message).toBe(message);
  });

  it('S12: an unreachable API keeps the resolver copy and the fallback flag', async () => {
    const resolve = jest.fn().mockResolvedValue({
      ok: false,
      status: 'unavailable',
      message: 'The Laravel API is unavailable. Retry when connected.',
      usingFallback: true,
    } satisfies BarcodeLookupResult);
    const { result } = renderHook(() => useBarcodeScan({ resolve }));

    act(() => result.current.handleBarcode(EAN13_IN_STOCK));

    await waitFor(() => expect(result.current.outcome?.kind).toBe('unavailable'));
    expect(result.current.outcome).toMatchObject({
      title: 'API unavailable',
      message: 'The Laravel API is unavailable. Retry when connected.',
      usingFallback: true,
    });
  });

  it('S13: a rejected resolver never leaves the session busy or locked', async () => {
    const resolve: BarcodeResolver = jest.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useBarcodeScan({ resolve }));

    act(() => result.current.handleBarcode(EAN13_IN_STOCK));

    await waitFor(() => expect(result.current.outcome?.kind).toBe('error'));
    expect(result.current.busy).toBe(false);
    expect(result.current.scanning).toBe(false);

    act(() => result.current.rearm());
    expect(result.current.scanning).toBe(true);
  });
});
