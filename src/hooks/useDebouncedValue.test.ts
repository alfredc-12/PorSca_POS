import { act, renderHook } from '@testing-library/react-native';
import { useDebouncedValue } from '@/src/hooks/useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('holds the previous value until the delay has passed', () => {
    const { result, rerender } = renderHook(({ value }: { value: string }) => useDebouncedValue(value, 280), {
      initialProps: { value: '' },
    });

    rerender({ value: 's' });
    expect(result.current).toBe('');

    act(() => jest.advanceTimersByTime(279));
    expect(result.current).toBe('');

    act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe('s');
  });

  it('collapses a burst of keystrokes into the last value', () => {
    const { result, rerender } = renderHook(({ value }: { value: string }) => useDebouncedValue(value, 280), {
      initialProps: { value: '' },
    });

    for (const value of ['s', 'sa', 'sar', 'sard', 'sardi', 'sardin', 'sardine', 'sardines']) {
      rerender({ value });
      act(() => jest.advanceTimersByTime(40));
    }
    act(() => jest.advanceTimersByTime(280));

    expect(result.current).toBe('sardines');
  });

  it('does not churn when the value is unchanged', () => {
    const { result, rerender } = renderHook(({ value }: { value: string }) => useDebouncedValue(value, 280), {
      initialProps: { value: 'milk' },
    });

    rerender({ value: 'milk' });
    act(() => jest.advanceTimersByTime(280));

    expect(result.current).toBe('milk');
  });
});
