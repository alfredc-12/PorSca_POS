import 'react-native-gesture-handler';
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/src/context/AuthContext';
import { PosProvider } from '@/src/context/PosContext';
import { SessionLoading } from '@/src/components/SessionLoading';
import { colors } from '@/src/theme/tokens';

export function RootNavigator() {
  const { status, isAdmin } = useAuth();
  if (status === 'loading') return <SessionLoading />;
  const signedIn = status === 'signed-in';

  const navigator = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scanner" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="checkout" />
        <Stack.Protected guard={isAdmin}>
          <Stack.Screen name="product-form" />
        </Stack.Protected>
      </Stack.Protected>
    </Stack>
  );

  // Unmount all cart, payment, and catalog state on sign-out/401. No protected
  // reads occur during restoration or while the login screen is open.
  return signedIn ? <PosProvider>{navigator}</PosProvider> : navigator;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}
