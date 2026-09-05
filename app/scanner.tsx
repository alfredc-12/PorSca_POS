import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { AppButton } from '@/src/components/AppButton';
import { usePos } from '@/src/context/PosContext';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const { addByBarcode } = usePos();

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={styles.permission}>
        <Text style={styles.permissionTitle}>Camera access is needed</Text>
        <Text style={styles.permissionText}>PorSca POS uses the camera only to scan product barcodes during checkout.</Text>
        <AppButton label="Allow camera" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] }}
        onBarcodeScanned={locked ? undefined : ({ data }) => {
          setLocked(true);
          const result = addByBarcode(data);
          if (result.ok) {
            router.back();
          } else {
            Alert.alert('Unable to add product', result.message, [
              { text: 'Try again', onPress: () => setLocked(false) },
              { text: 'Cancel', style: 'cancel', onPress: () => router.back() },
            ]);
          }
        }}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.title}>Place the barcode inside the frame</Text>
        <Text style={styles.caption}>The product will be added automatically when recognized.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  permission: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, justifyContent: 'center', gap: spacing.lg },
  permissionTitle: { color: colors.text, fontSize: typography.heading, fontWeight: '900' },
  permissionText: { color: colors.textMuted, fontSize: typography.body, lineHeight: 24 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(0,0,0,0.18)' },
  frame: { width: '88%', aspectRatio: 1.7, borderRadius: radius.lg, borderWidth: 3, borderColor: colors.white, marginBottom: spacing.xl },
  title: { color: colors.white, fontSize: typography.title, fontWeight: '800', textAlign: 'center' },
  caption: { color: '#E8ECE9', fontSize: typography.label, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },
});
