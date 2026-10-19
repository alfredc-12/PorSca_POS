import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { BarcodeScanner } from '@/src/components/BarcodeScanner';

export { ADDED_CONFIRMATION_MS } from '@/src/components/BarcodeScanner';

export default function ScannerScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <BarcodeScanner inventoryMode={mode === 'inventory'} />;
}
