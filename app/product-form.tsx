import React from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ProductEditor } from '@/src/components/ProductEditor';
import { DataState } from '@/src/components/DataState';
import { useAuth } from '@/src/context/AuthContext';
import { usePos } from '@/src/context/PosContext';

export { validateProductDraft } from '@/src/domain/productDraft';
export type { ProductDraftErrors } from '@/src/domain/productDraft';

export default function ProductFormScreen() {
  const { isAdmin } = useAuth();
  const { id, barcode } = useLocalSearchParams<{ id?: string; barcode?: string }>();
  const { products, inventoryProducts } = usePos();
  if (!isAdmin) return <Redirect href="/(tabs)/inventory" />;
  const product = [...products, ...inventoryProducts].find((item) => item.id === id);
  if (id && !product) return <DataState kind="not-found" title="Product was not found" message="Refresh inventory and open the product again. No changes were made." actionLabel="Go back" onAction={() => router.back()} />;
  return <View style={{ flex: 1, padding: 16, width: '100%', maxWidth: 600, alignSelf: 'center' }}><ProductEditor key={id ?? barcode ?? 'new'} product={product} scannedBarcode={barcode} onClose={() => router.back()} /></View>;
}
