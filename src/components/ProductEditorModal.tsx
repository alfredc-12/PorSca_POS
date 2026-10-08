import React, { useRef } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';
import { Product } from '@/src/types';
import { ProductEditor, ProductEditorHandle } from './ProductEditor';

export function ProductEditorModal({ product, scannedBarcode, onClose }: { product?: Product; scannedBarcode?: string; onClose: () => void }) {
  const editor = useRef<ProductEditorHandle>(null);
  return <Modal visible transparent animationType="fade" onShow={() => editor.current?.focus()} onRequestClose={() => editor.current?.requestClose()}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.dialog} accessibilityViewIsModal>
        <ProductEditor ref={editor} product={product} scannedBarcode={scannedBarcode} onClose={onClose} />
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,25,54,0.48)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 560, maxHeight: '94%', flexShrink: 1 },
});
