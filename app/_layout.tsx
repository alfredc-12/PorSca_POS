import 'react-native-gesture-handler';
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PosProvider } from '@/src/context/PosContext';
import { colors } from '@/src/theme/tokens';

export default function RootLayout() {
  return (
    <PosProvider>
      <StatusBar style="dark" backgroundColor={colors.background} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scanner" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="checkout" />
        <Stack.Screen name="product-form" />
      </Stack>
    </PosProvider>
  );
}
