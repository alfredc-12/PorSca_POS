import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/src/components/AppButton';
import { Screen } from '@/src/components/Screen';
import { usePos } from '@/src/context/PosContext';
import { useAuth } from '@/src/context/AuthContext';
import { BarcodeScanOutcome, useBarcodeScan } from '@/src/hooks/useBarcodeScan';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

/**
 * How long the added confirmation stays up before the scanner returns to the
 * cart on its own. The cashier can tap it to return immediately.
 */
export const ADDED_CONFIRMATION_MS = 1200;

export default function ScannerScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const inventoryMode = mode === 'inventory';
  const { isAdmin } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const { addByBarcode, lookupProductByBarcode } = usePos();
  const resolve = inventoryMode ? lookupProductByBarcode : addByBarcode;
  const { busy, outcome, scanning, handleBarcode, rearm } = useBarcodeScan({ resolve, cameraReady });

  const foundProduct = outcome?.kind === 'found' ? outcome.product : undefined;

  // An inventory scan opens the matching product, which is the existing path.
  useEffect(() => {
    if (inventoryMode && isAdmin && foundProduct) {
      router.replace({ pathname: '/product-form', params: { id: foundProduct.id } });
    }
  }, [foundProduct, inventoryMode, isAdmin]);

  // A POS scan adds the product immediately and confirms it in place.
  useEffect(() => {
    if (inventoryMode || outcome?.kind !== 'found') return;
    const timer = setTimeout(() => router.back(), ADDED_CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [inventoryMode, outcome]);

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

  const card = inventoryMode && isAdmin && outcome?.kind === 'found' ? undefined : outcome;

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] }}
        onCameraReady={() => setCameraReady(true)}
        onBarcodeScanned={scanning ? ({ data }) => handleBarcode(data) : undefined}
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

        {card ? (
          <ScanOutcomeCard
            outcome={card}
            inventoryMode={inventoryMode}
            canManageProducts={isAdmin}
            onScanAgain={rearm}
            onClose={() => router.back()}
          />
        ) : (
          <View style={styles.centerArea} pointerEvents="none">
            <View style={styles.frame}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              <View style={styles.scanLine} />
            </View>
            <Text style={styles.title}>{busy ? 'Looking up barcode…' : !cameraReady ? 'Starting the camera…' : 'Place the barcode inside the frame'}</Text>
            <Text style={styles.caption}>{busy ? 'Checking the authoritative Laravel catalog.' : inventoryMode ? isAdmin ? 'We will open the matching product or prepare a new item.' : 'View the matching product and stock. Inventory is read-only.' : 'The product is added to the cart as soon as it is recognized.'}</Text>
            {busy || !cameraReady ? <ActivityIndicator color={colors.white} size="large" style={styles.lookupIndicator} /> : null}
          </View>
        )}

        <View style={styles.bottomCard} pointerEvents="none">
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
          <Text style={styles.bottomText}>Barcode scanning only • No photo is saved</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

function ScanOutcomeCard({
  outcome,
  inventoryMode,
  canManageProducts,
  onScanAgain,
  onClose,
}: {
  outcome: BarcodeScanOutcome;
  inventoryMode: boolean;
  canManageProducts: boolean;
  onScanAgain: () => void;
  onClose: () => void;
}) {
  const added = outcome.kind === 'found' && !inventoryMode;
  const inventoryMissing = inventoryMode && (outcome.kind === 'not-found' || outcome.kind === 'invalid');
  const tone = added ? 'success' : inventoryMissing ? 'warning' : outcome.kind === 'found' ? 'success' : 'warning';
  const icon = added
    ? 'checkmark-circle'
    : outcome.kind === 'out-of-stock' || outcome.kind === 'limit-reached'
      ? 'alert-circle'
      : outcome.kind === 'unavailable'
        ? 'cloud-offline'
        : inventoryMissing
          ? 'barcode-outline'
          : 'close-circle';

  return (
    <View style={styles.resultArea}>
      <Pressable
        accessibilityRole={added ? 'button' : undefined}
        accessibilityLabel={added ? 'Product added to cart. Return to the cart' : undefined}
        disabled={!added}
        onPress={onClose}
        style={[styles.resultCard, tone === 'success' ? styles.resultCardSuccess : styles.resultCardWarning]}
      >
        <View style={[styles.resultIcon, tone === 'success' ? styles.resultIconSuccess : styles.resultIconWarning]}>
          <Ionicons name={icon} size={32} color={tone === 'success' ? colors.primary : colors.warning} />
        </View>
        <Text testID="scanner-outcome-title" accessibilityLiveRegion="polite" style={styles.resultTitle}>{outcome.title}</Text>
        {outcome.product ? <Text numberOfLines={2} style={styles.resultProduct}>{outcome.product.name}</Text> : null}
        {outcome.product ? (
          <Text style={styles.resultMeta}>
            ₱{outcome.product.price.toFixed(2)}
            {outcome.quantity ? ` • ${outcome.quantity} in this sale` : ''}
            {` • ${outcome.product.stock} in stock`}
          </Text>
        ) : null}
        {outcome.matchedBarcode && outcome.matchedBarcode !== outcome.barcode ? (
          <Text style={styles.resultMeta}>Scanned {outcome.barcode} • matched {outcome.matchedBarcode}</Text>
        ) : null}
        <Text testID="scanner-outcome-message" style={styles.resultMessage}>{outcome.message}</Text>
        {outcome.usingFallback ? (
          <Text style={styles.resultWarning}>The offline demo catalog was used. Laravel was not consulted.</Text>
        ) : null}
      </Pressable>

      <View style={styles.resultActions}>
        {inventoryMissing ? (
          <>
            <AppButton testID="scanner-scan-again" label="Scan again" onPress={onScanAgain} style={styles.resultButton} />
            {canManageProducts ? <AppButton
              testID="scanner-add-product"
              label="Add product"
              variant="secondary"
              onPress={() => router.replace({ pathname: '/product-form', params: { barcode: outcome.barcode } })}
              style={styles.resultButton}
            /> : <AppButton label="Back to inventory" variant="secondary" onPress={onClose} style={styles.resultButton} />}
          </>
        ) : (
          <>
            {!added ? (
              <AppButton testID="scanner-scan-again" label="Scan again" onPress={onScanAgain} style={styles.resultButton} />
            ) : null}
            <AppButton
              testID={added ? 'scanner-done' : 'scanner-back-to-cart'}
              label={added ? 'Done' : inventoryMode ? 'Back to inventory' : 'Back to cart'}
              variant={added ? 'primary' : 'secondary'}
              onPress={() => router.back()}
              style={styles.resultButton}
            />
          </>
        )}
      </View>

      {added ? <Text style={styles.resultHint}>Returning to the cart…</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  tint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(8,19,15,0.24)' },
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
  lookupIndicator: { marginTop: spacing.md },
  resultArea: { gap: spacing.md },
  resultCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.xl, alignItems: 'center', gap: 6 },
  resultCardSuccess: { backgroundColor: 'rgba(255,252,248,0.97)', borderColor: colors.primarySoft },
  resultCardWarning: { backgroundColor: 'rgba(255,252,248,0.97)', borderColor: colors.warningSoft },
  resultIcon: { width: 64, height: 64, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  resultIconSuccess: { backgroundColor: colors.primarySoft },
  resultIconWarning: { backgroundColor: colors.warningSoft },
  resultTitle: { color: colors.text, fontSize: typography.heading, fontWeight: '900', textAlign: 'center' },
  resultProduct: { color: colors.text, fontSize: typography.title, fontWeight: '800', textAlign: 'center' },
  resultMeta: { color: colors.textMuted, fontSize: typography.caption, textAlign: 'center' },
  resultMessage: { color: colors.text, fontSize: typography.label, lineHeight: 21, textAlign: 'center', marginTop: spacing.xs },
  resultWarning: { color: colors.warning, fontSize: typography.caption, fontWeight: '700', textAlign: 'center', marginTop: spacing.xs },
  resultActions: { gap: spacing.sm },
  resultButton: { alignSelf: 'stretch' },
  resultHint: { color: '#E8ECE9', fontSize: typography.caption, textAlign: 'center', fontWeight: '600' },
  bottomCard: { minHeight: 52, marginBottom: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(255,252,248,0.94)', paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bottomText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  permissionCard: { minHeight: 330, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.xl, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  permissionIcon: { width: 72, height: 72, borderRadius: 23, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  permissionTitle: { color: colors.text, fontSize: typography.heading, fontWeight: '900', textAlign: 'center' },
  permissionText: { color: colors.textMuted, fontSize: typography.body, lineHeight: 23, textAlign: 'center' },
  fullButton: { alignSelf: 'stretch', marginTop: spacing.sm },
});
