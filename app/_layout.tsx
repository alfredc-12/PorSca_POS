import 'react-native-gesture-handler';
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PosProvider } from '@/src/context/PosContext';
import { colors } from '@/src/theme/tokens';

export default function RootLayout() {
  return (
    <PosProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scanner" options={{ title: 'Scan product', presentation: 'modal' }} />
        <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
        <Stack.Screen name="product-form" options={{ title: 'Product' }} />
      </Stack>
    </PosProvider>
  );
}
