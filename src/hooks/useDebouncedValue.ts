import { useEffect, useState } from 'react';

/**
 * Trailing-edge debounce for values that drive a network read. Typing a product
 * name into the POS search used to fire one request per keystroke (defect G6).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (value === debounced) return;
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [debounced, delayMs, value]);

  return debounced;
}
