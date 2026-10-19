import React from 'react';
import { StyleSheet } from 'react-native';
import { CameraView } from 'expo-camera';
import { TemporaryCameraSettings } from '@/src/domain/temporaryCamera';

export type ScannerCameraProps = {
  settings: TemporaryCameraSettings;
  onReady: () => void;
  onError: (reason: 'camera' | 'decoder') => void;
  onBarcode?: (data: string) => void;
};

export function ScannerCamera({ settings, onReady, onError, onBarcode }: ScannerCameraProps) {
  return <CameraView style={[StyleSheet.absoluteFill, { transform: [{ scaleY: settings.flipVertical ? -1 : 1 }] }]} facing="back" mirror={settings.mirror} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] }} onCameraReady={onReady} onMountError={() => onError('camera')} onBarcodeScanned={onBarcode ? ({ data }) => onBarcode(data) : undefined} />;
}
