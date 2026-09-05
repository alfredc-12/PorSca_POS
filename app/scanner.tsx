import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/src/components/AppButton';
import { Screen } from '@/src/components/Screen';
import { usePos } from '@/src/context/PosContext';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

export default function ScannerScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const inventoryMode = mode === 'inventory';
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const { addByBarcode, products } = usePos();

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <Screen title="Camera Access" subtitle="PorSca uses the camera only to recognize product barcodes." back>
        <View style={styles.permissionCard}>
          <View style={styles.permissionIcon}><Ionicons name="camera-outline" size={38} color={colors.primary} /></View>
          <Text style={styles.permissionTitle}>Allow camera access to scan products</Text>
          <Text style={styles.permissionText}>The camera preview is used for barcode detection. PorSca does not need to save a photo of the product.</Text>
          <AppButton label="Allow Camera" onPress={requestPermission} style={styles.fullButton} />
        </View>
      </Screen>
    );
  }

  const handleBarcode = (data: string) => {
    setLocked(true);

    if (inventoryMode) {
      const product = products.find((item) => item.barcode === data);
      if (product) {
        router.replace({ pathname: '/product-form', params: { id: product.id } });
        return;
      }
      Alert.alert('Barcode not in inventory', 'This barcode does not belong to an existing product. Would you like to create it?', [
        { text: 'Scan again', onPress: () => setLocked(false) },
        { text: 'Add product', onPress: () => router.replace({ pathname: '/product-form', params: { barcode: data } }) },
      ]);
      return;
    }

    const result = addByBarcode(data);
    if (result.ok) {
      router.back();
    } else {
      Alert.alert('Unable to add product', result.message, [
        { text: 'Try again', onPress: () => setLocked(false) },
        { text: 'Cancel', style: 'cancel', onPress: () => router.back() },
      ]);
    }
  };

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] }}
        onBarcodeScanned={locked ? undefined : ({ data }) => handleBarcode(data)}
      />
      <View style={styles.tint} pointerEvents="none" />
      <SafeAreaView style={styles.safeOverlay} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable accessibilityLabel="Close scanner" onPress={() => router.back()} style={styles.closeButton}>
            <Ionicons name="close" size={25} color={colors.white} />
          </Pressable>
          <View style={styles.modePill}>
            <Ionicons name={inventoryMode ? 'cube-outline' : 'cart-outline'} size={17} color={colors.white} />
            <Text style={styles.modeText}>{inventoryMode ? 'Inventory Scan' : 'POS Scan'}</Text>
          </View>
          <View style={styles.closeSpacer} />
        </View>

        <View style={styles.centerArea} pointerEvents="none">
          <View style={styles.frame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
            <View style={styles.scanLine} />
          </View>
          <Text style={styles.title}>Place the barcode inside the frame</Text>
          <Text style={styles.caption}>{inventoryMode ? 'We will open the matching product or prepare a new item.' : 'The product is added to the cart as soon as it is recognized.'}</Text>
        </View>

        <View style={styles.bottomCard} pointerEvents="none">
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
          <Text style={styles.bottomText}>Barcode scanning only • No photo is saved</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,19,15,0.24)' },
  safeOverlay: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: 'space-between' },
  topBar: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeButton: { width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(10,13,11,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  closeSpacer: { width: 46 },
  modePill: { minHeight: 42, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: 'rgba(7,131,81,0.84)', flexDirection: 'row', alignItems: 'center', gap: 7 },
  modeText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  centerArea: { alignItems: 'center', paddingHorizontal: spacing.md },
  frame: { width: '100%', maxWidth: 430, aspectRatio: 1.55, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.05)', position: 'relative', marginBottom: spacing.xl },
  corner: { position: 'absolute', width: 56, height: 56, borderColor: colors.white },
  topLeft: { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: radius.lg },
  topRight: { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: radius.lg },
  bottomLeft: { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: radius.lg },
  bottomRight: { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: radius.lg },
  scanLine: { position: 'absolute', left: 24, right: 24, top: '50%', height: 2, borderRadius: 1, backgroundColor: '#63E5A4' },
  title: { color: colors.white, fontSize: typography.title, fontWeight: '900', textAlign: 'center' },
  caption: { color: '#E8ECE9', fontSize: typography.label, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20, maxWidth: 380 },
  bottomCard: { minHeight: 52, marginBottom: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(255,252,248,0.94)', paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bottomText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  permissionCard: { minHeight: 330, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.xl, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  permissionIcon: { width: 72, height: 72, borderRadius: 23, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  permissionTitle: { color: colors.text, fontSize: typography.heading, fontWeight: '900', textAlign: 'center' },
  permissionText: { color: colors.textMuted, fontSize: typography.body, lineHeight: 23, textAlign: 'center' },
  fullButton: { alignSelf: 'stretch', marginTop: spacing.sm },
});
