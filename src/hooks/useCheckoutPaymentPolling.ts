import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

export const CHECKOUT_QR_POLL_DELAYS_MS = [2500, 5000, 10000, 15000] as const;
/** Scheduling is presentation only. Sent requests are never cancelled financially. */
export function useCheckoutPaymentPolling({ identity, eligible, busy, check }: {
  identity?: string; eligible: boolean; busy: boolean;
  check: (isCurrent: () => boolean) => Promise<void>;
}) {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const latest = useRef({ identity, eligible, busy, check, focused, active });
  useLayoutEffect(() => { latest.current = { identity, eligible, busy, check, focused, active }; }, [identity, eligible, busy, check, focused, active]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const running = useRef(false);
  const step = useRef(0);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const cancel = useCallback(() => { clearTimeout(timer.current); timer.current = undefined; }, []);
  const schedule = useRef<() => void>(() => undefined);
  useFocusEffect(useCallback(() => {
    latest.current.focused = true;
    setFocused(true);
    return () => { latest.current.focused = false; epoch.current += 1; cancel(); setFocused(false); };
  }, [cancel]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      const nextActive = state === 'active';
      latest.current.active = nextActive;
      if (!nextActive) { epoch.current += 1; cancel(); }
      setActive(nextActive);
    });
    return () => subscription.remove();
  }, [cancel]);
  const run = useCallback(async (manual = false) => {
    const current = latest.current;
    if (running.current || current.busy || !current.identity || !current.focused || !current.active) return;
    cancel();
    const startedEpoch = epoch.current;
    const id = current.identity;
    running.current = true;
    step.current = manual ? Math.max(1, step.current) : Math.min(step.current + 1, CHECKOUT_QR_POLL_DELAYS_MS.length - 1);
    try { await current.check(() => mounted.current && epoch.current === startedEpoch && latest.current.identity === id && latest.current.focused && latest.current.active); }
    finally { running.current = false; schedule.current(); }
  }, [cancel]);
  useEffect(() => { schedule.current = () => {
    cancel();
    const current = latest.current;
    if (!mounted.current || running.current || current.busy || !current.eligible || !current.identity || !current.focused || !current.active) return;
    timer.current = setTimeout(() => void run(), CHECKOUT_QR_POLL_DELAYS_MS[step.current]);
  }; }, [cancel, run]);
  useEffect(() => {
    epoch.current += 1;
    step.current = 0;
    schedule.current();
    return cancel;
  }, [identity, focused, active, cancel]);
  useEffect(() => { schedule.current(); return cancel; }, [busy, eligible, cancel]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current += 1; cancel(); }; }, [cancel]);
  const checkNow = useCallback(() => run(true), [run]);
  return { checkNow, visible: focused && active };
}
