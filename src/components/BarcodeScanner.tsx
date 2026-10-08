import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/src/components/AppButton';
import { Screen } from '@/src/components/Screen';
import { usePos } from '@/src/context/PosContext';
import { useAuth } from '@/src/context/AuthContext';
import { BarcodeScanOutcome, useBarcodeScan } from '@/src/hooks/useBarcodeScan';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';
import { DEFAULT_CAMERA_SETTINGS, TemporaryCameraSettings } from '@/src/domain/temporaryCamera';
import { ScannerCamera } from './ScannerCamera';
import { TemporaryCameraControls } from './TemporaryCameraControls';

/**
 * How long the added confirmation stays up before the scanner returns to the
 * cart on its own. The cashier can tap it to return immediately.
 */
export const ADDED_CONFIRMATION_MS = 1200;
const closeScannerRoute = () => router.back();

export function BarcodeScanner({ inventoryMode = false, onClose = closeScannerRoute, onInventoryResult }: {
  inventoryMode?: boolean;
  onClose?: () => void;
  onInventoryResult?: (outcome: BarcodeScanOutcome) => void;
}) {
  const { isAdmin } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<'camera' | 'decoder'>();
  const [cameraSettings, setCameraSettings] = useState(() => ({ ...DEFAULT_CAMERA_SETTINGS }));
  const [cameraSettingsOpen, setCameraSettingsOpen] = useState(false);
  const [cameraGeneration, setCameraGeneration] = useState(0);
  const delivered = useRef(false);
  const { addByBarcode, lookupProductByBarcode } = usePos();
  const resolve = inventoryMode ? lookupProductByBarcode : addByBarcode;
  const { busy, outcome, scanning, handleBarcode, rearm } = useBarcodeScan({ resolve, cameraReady: cameraReady && !cameraSettingsOpen });
  const changeCameraSettings = (settings: TemporaryCameraSettings) => {
    if (busy) return;
    if (settings.deviceId !== cameraSettings.deviceId) {
      setCameraReady(false); setCameraError(undefined); setCameraGeneration((value) => value + 1);
    }
    setCameraSettings(settings);
  };

  const foundProduct = outcome?.kind === 'found' ? outcome.product : undefined;

  // Deliver one authoritative result; the inventory owns the editor modal.
  useEffect(() => {
    if (!inventoryMode || !isAdmin || !outcome || outcome.usingFallback || delivered.current) return;
    if (onInventoryResult && (outcome.kind === 'found' || outcome.kind === 'not-found')) {
      delivered.current = true;
      onInventoryResult(outcome);
    } else if (foundProduct && !onInventoryResult) {
      delivered.current = true;
      router.replace({ pathname: '/product-form', params: { id: foundProduct.id } });
    }
  }, [foundProduct, inventoryMode, isAdmin, outcome, onInventoryResult]);

  // A POS scan adds the product immediately and confirms it in place.
  useEffect(() => {
    if (inventoryMode || outcome?.kind !== 'found') return;
    const timer = setTimeout(() => onClose(), ADDED_CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [inventoryMode, outcome, onClose]);

  if (!permission) return <Screen title="Starting camera"><ActivityIndicator accessibilityLabel="Checking camera permission" /><AppButton label="Close scanner" onPress={onClose} variant="secondary" /></Screen>;

  if (!permission.granted) {
    return (
      <Screen title="Camera Access" subtitle="PorSca uses the camera only to recognize product barcodes.">
        <View style={styles.permissionCard}>
          <View style={styles.permissionIcon}><Ionicons name="camera-outline" size={38} color={colors.primary} /></View>
          <Text style={styles.permissionTitle}>Allow camera access to scan products</Text>
          <Text style={styles.permissionText}>The camera preview is used for barcode detection. PorSca does not need to save a photo of the product.</Text>
          <AppButton label="Allow Camera" onPress={() => void requestPermission()} style={styles.fullButton} />
          <AppButton label="Close scanner" onPress={onClose} variant="secondary" style={styles.fullButton} />
        </View>
      </Screen>
    );
  }

  const card = inventoryMode && isAdmin && !outcome?.usingFallback && (outcome?.kind === 'found' || (onInventoryResult && outcome?.kind === 'not-found')) ? undefined : outcome;

  return (
    <View style={styles.root}>
      {!cameraError ? <ScannerCamera
        key={cameraGeneration}
        settings={cameraSettings}
        onReady={() => setCameraReady(true)}
        onError={(reason) => { setCameraReady(false); setCameraError(reason); }}
        onBarcode={scanning ? handleBarcode : undefined}
      /> : null}
      <View style={styles.tint} pointerEvents="none" />
      <SafeAreaView style={styles.safeOverlay} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close scanner" onPress={() => onClose()} style={styles.closeButton}>
            <Ionicons name="close" size={25} color={colors.white} />
          </Pressable>
          <View style={styles.modePill}>
            <Ionicons name={inventoryMode ? 'cube-outline' : 'cart-outline'} size={17} color={colors.white} />
            <Text style={styles.modeText}>{inventoryMode ? 'Inventory Scan' : 'POS Scan'}</Text>
          </View>
          <View style={styles.closeSpacer} />
        </View>

        {cameraError ? (
          <View style={styles.resultArea}>
            <View style={[styles.resultCard, styles.resultCardWarning]}>
              <Text style={styles.resultTitle}>{cameraError === 'decoder' ? 'Barcode reader unavailable' : 'Camera unavailable'}</Text>
              <Text style={styles.resultMessage}>{cameraError === 'decoder' ? 'The barcode reader could not start. Check your connection and retry.' : 'Allow camera access in your browser and close other apps using it, then retry or choose another camera.'}</Text>
              <AppButton label="Retry camera" onPress={() => { setCameraError(undefined); setCameraReady(false); setCameraGeneration((value) => value + 1); rearm(); }} />
              <AppButton label="Close scanner" onPress={onClose} variant="secondary" />
            </View>
          </View>
        ) : card ? (
          <ScanOutcomeCard
            outcome={card}
            inventoryMode={inventoryMode}
            canManageProducts={isAdmin}
            onScanAgain={rearm}
            onClose={() => onClose()}
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
            <Text accessibilityLiveRegion="polite" style={styles.title}>{busy ? 'Looking up barcode…' : cameraSettingsOpen ? 'Scanning paused' : !cameraReady ? 'Starting the camera…' : 'Place the barcode inside the frame'}</Text>
            <Text style={styles.caption}>{busy ? 'Checking the current catalog.' : cameraSettingsOpen ? 'Close camera settings to resume barcode scanning.' : inventoryMode ? isAdmin ? 'We will open the matching product or prepare a new item.' : 'View the matching product and stock. Inventory is read-only.' : 'The product is added to the cart as soon as it is recognized.'}</Text>
            {busy || !cameraReady ? <ActivityIndicator color={colors.white} size="large" style={styles.lookupIndicator} /> : null}
          </View>
        )}

        <View style={styles.bottomCard} pointerEvents="none">
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
          <Text style={styles.bottomText}>Barcode scanning only • No photo is saved</Text>
        </View>
      </SafeAreaView>
      {__DEV__ ? <TemporaryCameraControls settings={cameraSettings} onChange={changeCameraSettings} onOpenChange={setCameraSettingsOpen} busy={busy} /> : null}
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
  const inventoryMissing = inventoryMode && outcome.kind === 'not-found' && !outcome.usingFallback;
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
          <Text style={styles.resultWarning}>Showing an item saved on this device. The shop server was not consulted.</Text>
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
              onPress={() => onClose()}
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
  closeButton: { width: 48, height: 48, borderRadius: 15, backgroundColor: 'rgba(10,13,11,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  closeSpacer: { width: 48 },
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
  resultWarning: { color: colors.text, fontSize: typography.caption, fontWeight: '700', textAlign: 'center', marginTop: spacing.xs },
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
