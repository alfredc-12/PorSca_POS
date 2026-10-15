import { act, renderHook } from '@testing-library/react-native';
import { AppState, AppStateStatus } from 'react-native';
import { useCheckoutPaymentPolling } from './useCheckoutPaymentPolling';
let mockFocused = true;
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => jest.requireActual<typeof import('react')>('react').useEffect(() => mockFocused ? callback() : undefined, [callback, mockFocused]) }));
const flush = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); };
describe('bounded checkout polling', () => {
  beforeEach(() => { jest.useFakeTimers(); mockFocused = true; Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' }); });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
  it('sends at most five quick pending checks in the first minute', async () => {
    const check = jest.fn().mockResolvedValue(undefined);
    renderHook(() => useCheckoutPaymentPolling({ identity: 'c:7', eligible: true, busy: false, check }));
    for (const delay of [2500, 5000, 10000, 15000, 15000, 12500]) await flush(delay);
    expect(check).toHaveBeenCalledTimes(5);
  });
  it('never overlaps slow checks or immediate manual taps, and waits at least five seconds after manual pending', async () => {
    let settle!: () => void;
    const check = jest.fn().mockImplementation(() => new Promise<void>(resolve => { settle = resolve; }));
    const { result } = renderHook(() => useCheckoutPaymentPolling({ identity: 'c:7', eligible: true, busy: false, check }));
    await flush(2500);
    await act(async () => { void result.current.checkNow(); void result.current.checkNow(); });
    await flush(60000);
    expect(check).toHaveBeenCalledTimes(1);
    await act(async () => { settle(); });
    await flush(4999); expect(check).toHaveBeenCalledTimes(1);
    await flush(1); expect(check).toHaveBeenCalledTimes(2);
  });
  it('cancels the pending timeout for an immediate manual check', async () => {
    const check = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useCheckoutPaymentPolling({ identity: 'c:7', eligible: true, busy: false, check }));
    await flush(1000);
    await act(async () => { await result.current.checkNow(); });
    expect(check).toHaveBeenCalledTimes(1);
    await flush(4999); expect(check).toHaveBeenCalledTimes(1);
    await flush(1); expect(check).toHaveBeenCalledTimes(2);
  });
  it('stops for unknown and shared operations but allows explicit checks and reversible pending', async () => {
    const check = jest.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ eligible, busy }: { eligible: boolean; busy: boolean }) => useCheckoutPaymentPolling({ identity: 'c:7', eligible, busy, check }), { initialProps: { eligible: false, busy: true } });
    await flush(60000); await act(async () => { await result.current.checkNow(); }); expect(check).not.toHaveBeenCalled();
    rerender({ eligible: false, busy: false });
    await act(async () => { await result.current.checkNow(); }); expect(check).toHaveBeenCalledTimes(1);
    rerender({ eligible: true, busy: false });
    await flush(5000); expect(check).toHaveBeenCalledTimes(2);
  });
  it('resumes a single timer when focus returns before an obsolete slow request settles', async () => {
    let settle!: () => void;
    const check = jest.fn(() => new Promise<void>(resolve => { settle = resolve; }));
    const { rerender } = renderHook(({ identity }: { identity: string }) => useCheckoutPaymentPolling({ identity, eligible: true, busy: false, check }), { initialProps: { identity: 'c:7' } });
    await flush(2500); mockFocused = false; rerender({ identity: 'c:7' });
    mockFocused = true; rerender({ identity: 'c:7' });
    await flush(60000); expect(check).toHaveBeenCalledTimes(1);
    await act(async () => { settle(); });
    await flush(2499); expect(check).toHaveBeenCalledTimes(1); await flush(1); expect(check).toHaveBeenCalledTimes(2);
  });
  it('stops scheduling on blur, background, identity replacement and unmount', async () => {
    let listener!: (state: AppStateStatus) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { listener = callback; return { remove: jest.fn() }; });
    let settle!: () => void;
    const check = jest.fn(() => new Promise<void>(resolve => { settle = resolve; }));
    const { rerender, unmount } = renderHook(({ identity }: { identity: string }) => useCheckoutPaymentPolling({ identity, eligible: true, busy: false, check }), { initialProps: { identity: 'c:7' } });
    await flush(2500);
    mockFocused = false; rerender({ identity: 'c:7' });
    await act(async () => { settle(); }); await flush(60000); expect(check).toHaveBeenCalledTimes(1);
    mockFocused = true; rerender({ identity: 'c:7' });
    await flush(2500); expect(check).toHaveBeenCalledTimes(2);
    act(() => listener('background'));
    await act(async () => { settle(); }); await flush(60000); expect(check).toHaveBeenCalledTimes(2);
    act(() => listener('active'));
    rerender({ identity: 'c:8' });
    await flush(2500); expect(check).toHaveBeenCalledTimes(3);
    unmount();
    await act(async () => { settle(); }); await flush(60000); expect(check).toHaveBeenCalledTimes(3);
  });
});
