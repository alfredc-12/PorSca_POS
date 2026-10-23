import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';

type Props = { expiresAt?: string | null };

/** A local display clock only; expiry never changes the checkout or payment state. */
export function QrExpiryCountdown({ expiresAt }: Props) {
  const expiryTime = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const hasExpiry = Number.isFinite(expiryTime);
  const [now, setNow] = useState(() => Date.now());
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  useFocusEffect(useCallback(() => {
    setFocused(true);
    setNow(Date.now());
    return () => setFocused(false);
  }, []));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      const active = state === 'active';
      setAppActive(active);
      if (active) setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!hasExpiry || !focused || !appActive || expiryTime <= Date.now()) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= expiryTime) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [appActive, expiryTime, focused, hasExpiry]);

  if (!hasExpiry) {
    return <Text testID="qr-expiry-countdown" accessibilityRole="text" accessibilityLabel="QR expiry time unavailable">
      Expiry time unavailable
    </Text>;
  }

  const secondsRemaining = Math.max(0, Math.ceil((expiryTime - now) / 1000));
  const timeRemaining = `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`;
  return <Text
    testID="qr-expiry-countdown"
    accessibilityRole="text"
    accessibilityLabel={`QR time remaining ${timeRemaining}`}
  >
    Time remaining: {timeRemaining}
  </Text>;
}
