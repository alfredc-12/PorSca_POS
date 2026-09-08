import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { AppButton } from '@/src/components/AppButton';
import { ProductThumbnail } from '@/src/components/ProductThumbnail';
import { ApiClientError, Payment } from '@/src/api/client';
import { usePos } from '@/src/context/PosContext';
import { cashChange, paymentError } from '@/src/domain/pos';
import { PaymentStatus } from '@/src/types';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

type QrViewStatus = PaymentStatus | 'idle' | 'creating' | 'verification';

export default function CheckoutScreen() {
  const { method } = useLocalSearchParams<{ method?: string }>();
  const {
    total,
    cart,
    clearCart,
    completeCashSale,
    startQrPhPayment,
    refreshQrPhPayment,
    cancelQrPhPayment,
    confirmQrPhPayment,
  } = usePos();
  const [mode, setMode] = useState<'cash' | 'qrph'>(method === 'qrph' ? 'qrph' : 'cash');
  const [cash, setCash] = useState('');
  const [qrStatus, setQrStatus] = useState<QrViewStatus>('idle');
  const [qrPayment, setQrPayment] = useState<Payment>();
  const [qrError, setQrError] = useState<string>();
  const [cashError, setCashError] = useState<string>();
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const qrBusyRef = useRef(false);
  const handledPaidPayment = useRef<string | undefined>(undefined);

  const received = Number(cash) || 0;
  const cashResult = useMemo(() => cashChange(total, received), [received, total]);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const finishCash = async () => {
    setCashError(undefined);
    if (!cashResult.sufficient) {
      const message = `You are ₱${cashResult.shortfall.toFixed(2)} short. Enter at least ₱${total.toFixed(2)} and confirm again.`;
      setCashError(message);
      Alert.alert('Insufficient cash', message);
      return;
    }

    setCashSubmitting(true);
    try {
      const sale = await completeCashSale(received);
      if (!sale) {
        const message = 'The cart is empty. Return to the POS and add a product before trying again.';
        setCashError(message);
        Alert.alert('Unable to complete sale', message);
        return;
      }
      Alert.alert('Payment recorded', `${sale.id} was completed successfully.`, [{ text: 'Done', onPress: () => router.replace('/(tabs)/transactions') }]);
    } catch (error) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      const insufficientStock = apiError?.code === 'insufficient_stock' || apiError?.status === 409;
      const insufficientCash = apiError?.code === 'insufficient_cash';
      const title = insufficientStock ? 'Insufficient stock' : insufficientCash ? 'Insufficient cash' : 'Unable to complete sale';
      const message = insufficientStock
        ? `${apiError?.message ?? 'Some items are no longer available.'} Refresh inventory and remove the unavailable item, then try again.`
        : insufficientCash
          ? `${apiError?.message ?? 'Cash received is below the amount due.'} Enter more cash and confirm again. Your cart is still here.`
          : `The sale was not confirmed. ${apiError?.message ?? 'Check your connection and try again.'} Your cart is still here so you can retry safely.`;
      setCashError(message);
      Alert.alert(title, message);
    } finally {
      setCashSubmitting(false);
    }
  };

  const showQrPayment = useCallback(async (payment: Payment) => {
    setQrPayment(payment);
    setQrStatus(payment.status);
    setQrError(undefined);

    if (payment.status !== 'paid') return;

    try {
      await confirmQrPhPayment(payment);
      setQrStatus('paid');
      if (handledPaidPayment.current !== payment.id) {
        handledPaidPayment.current = payment.id;
        clearCart();
        Alert.alert(
          'Payment recorded',
          `QR Ph payment ${payment.saleId ?? payment.id} was confirmed by Laravel.`,
          [{ text: 'Done', onPress: () => router.replace('/(tabs)/transactions') }],
        );
      }
    } catch (error) {
      setQrStatus('verification');
      setQrError(verificationMessage(error));
    }
  }, [clearCart, confirmQrPhPayment]);

  const startQrPayment = useCallback(async (forceNew = false) => {
    if (qrBusyRef.current) return;
    qrBusyRef.current = true;
    setQrBusy(true);
    setQrStatus('creating');
    setQrError(undefined);
    try {
      const payment = await startQrPhPayment(forceNew);
      await showQrPayment(payment);
    } catch (error) {
      setQrStatus('verification');
      setQrError(verificationMessage(error));
    } finally {
      qrBusyRef.current = false;
      setQrBusy(false);
    }
  }, [showQrPayment, startQrPhPayment]);

  const checkQrPayment = useCallback(async () => {
    if (!qrPayment || qrBusyRef.current) return;
    qrBusyRef.current = true;
    setQrBusy(true);
    try {
      const payment = await refreshQrPhPayment(qrPayment.id);
      await showQrPayment(payment);
    } catch (error) {
      setQrStatus('verification');
      setQrError(verificationMessage(error));
    } finally {
      qrBusyRef.current = false;
      setQrBusy(false);
    }
  }, [qrPayment, refreshQrPhPayment, showQrPayment]);

  const cancelQrPayment = useCallback(async () => {
    if (!qrPayment || qrBusyRef.current) return;
    qrBusyRef.current = true;
    setQrBusy(true);
    try {
      const payment = await cancelQrPhPayment(qrPayment.id);
      await showQrPayment(payment);
    } catch (error) {
      setQrStatus('verification');
      setQrError(verificationMessage(error));
    } finally {
      qrBusyRef.current = false;
      setQrBusy(false);
    }
  }, [cancelQrPhPayment, qrPayment, showQrPayment]);

  useEffect(() => {
    if (mode !== 'qrph' || qrStatus !== 'pending' || !qrPayment) return;
    const timer = setInterval(() => {
      void checkQrPayment();
    }, 2500);
    return () => clearInterval(timer);
  }, [checkQrPayment, mode, qrPayment, qrStatus]);

  if (cart.length === 0) {
    return (
      <Screen title="Checkout" subtitle="There is nothing to pay yet." back>
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><Ionicons name="cart-outline" size={36} color={colors.primary} /></View>
          <Text style={styles.emptyTitle}>The cart is empty</Text>
          <Text style={styles.emptyBody}>Return to the POS and add a product before starting payment.</Text>
          <AppButton testID="return-to-pos" label="Return to POS" onPress={() => router.replace('/(tabs)/pos')} style={styles.fullButton} />
        </View>
      </Screen>
    );
  }

  const qrTerminal = qrStatus === 'failed' || qrStatus === 'cancelled' || qrStatus === 'expired';
  const qrHasPayment = Boolean(qrPayment);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title="Checkout" subtitle="Confirm the sale, then record payment before inventory is deducted." back>
        <View style={styles.dueCard}>
          <View>
            <Text style={styles.dueLabel}>Amount due</Text>
            <Text style={styles.dueTotal}>₱{total.toFixed(2)}</Text>
            <Text style={styles.dueItems}>{itemCount} {itemCount === 1 ? 'item' : 'items'} in this sale</Text>
          </View>
          <View style={styles.dueIcon}><Ionicons name="bag-check-outline" size={30} color={colors.primary} /></View>
        </View>

        <View style={styles.orderCard}>
          <Text style={styles.sectionTitle}>Order summary</Text>
          {cart.map((line, index) => (
            <View key={line.product.id} style={[styles.orderLine, index > 0 && styles.orderBorder]}>
              <ProductThumbnail product={line.product} size={46} />
              <View style={styles.orderCopy}>
                <Text numberOfLines={1} style={styles.orderName}>{line.product.name}</Text>
                <Text style={styles.orderMeta}>Qty {line.quantity} • ₱{line.product.price.toFixed(2)} each</Text>
              </View>
              <Text style={styles.orderAmount}>₱{(line.quantity * line.product.price).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.paymentCard}>
          <View style={styles.paymentHeader}>
            <View style={styles.headingRow}><Ionicons name="card-outline" size={23} color={colors.primary} /><Text style={styles.sectionTitle}>Payment Method</Text></View>
            <Text style={styles.helper}>Choose one</Text>
          </View>
          <View style={styles.segmentRow}>
            <Pressable testID="checkout-payment-cash" onPress={() => setMode('cash')} style={[styles.segment, mode === 'cash' && styles.segmentActive]}>
              <Ionicons name="cash-outline" size={22} color={mode === 'cash' ? colors.primary : colors.textMuted} />
              <Text style={styles.segmentText}>Cash</Text>
              <Ionicons name={mode === 'cash' ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={mode === 'cash' ? colors.primary : colors.outline} />
            </Pressable>
            <Pressable testID="checkout-payment-qrph" onPress={() => setMode('qrph')} style={[styles.segment, mode === 'qrph' && styles.segmentActive]}>
              <Ionicons name="qr-code-outline" size={22} color={mode === 'qrph' ? colors.primary : colors.textMuted} />
              <Text style={styles.segmentText}>QR Ph</Text>
              <Ionicons name={mode === 'qrph' ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={mode === 'qrph' ? colors.primary : colors.outline} />
            </Pressable>
          </View>

          {mode === 'cash' ? (
            <View style={styles.cashPanel}>
              <Text style={styles.label}>Cash received</Text>
              <View style={styles.moneyInputWrap}>
                <Text style={styles.currency}>₱</Text>
                <TextInput
                  testID="cash-received-input"
                  value={cash}
                  onChangeText={setCash}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  accessibilityLabel="Cash received"
                />
              </View>
              <View style={styles.changeBox}>
                <Text style={styles.changeLabel}>Change to customer</Text>
                <Text style={styles.changeValue}>₱{cashResult.change.toFixed(2)}</Text>
              </View>
              {cashError ? <Text testID="checkout-cash-error" accessibilityRole="alert" style={styles.cashError}>{cashError}</Text> : null}
              <AppButton
                testID="confirm-cash-payment"
                label={cashSubmitting ? 'Recording Cash Payment…' : 'Confirm Cash Payment'}
                onPress={finishCash}
                disabled={cashSubmitting}
                style={styles.fullButton}
              />
            </View>
          ) : (
            <View style={styles.qrPanel}>
              {qrPayment?.qrPayload ? <QrPayload payload={qrPayment.qrPayload} /> : (
                <View style={styles.qrPlaceholder}>
                  <Ionicons name="qr-code" size={112} color={colors.text} />
                </View>
              )}
              <Text style={styles.qrTitle}>Laravel QR Ph payment</Text>
              <Text style={styles.qrBody}>Laravel creates the transaction QR and confirms the payment before the sale is recorded. Failed, cancelled, expired, or unverified payments leave stock unchanged.</Text>
              {qrStatus !== 'idle' ? (
                <Text testID="qr-payment-status" accessibilityLiveRegion="polite" style={[styles.qrStatus, qrStatus === 'paid' ? styles.qrStatusPaid : qrStatus === 'verification' ? styles.qrStatusVerification : styles.qrStatusError]}>
                  {qrStatusText(qrStatus)}
                </Text>
              ) : null}
              {qrError ? <Text testID="qr-payment-error" accessibilityRole="alert" style={styles.qrError}>{qrError}</Text> : null}
              {qrStatus === 'idle' || qrStatus === 'verification' && !qrHasPayment ? (
                <AppButton testID="start-qrph-payment" label={qrStatus === 'verification' ? 'Retry QR Ph Payment' : 'Start QR Ph Payment'} onPress={() => void startQrPayment(false)} disabled={qrBusy} style={styles.fullButton} />
              ) : null}
              {qrStatus === 'creating' ? (
                <AppButton testID="start-qrph-payment" label="Creating QR Ph Payment…" onPress={() => undefined} disabled style={styles.fullButton} />
              ) : null}
              {qrStatus === 'pending' && qrPayment ? (
                <View style={styles.qrActions}>
                  <AppButton testID="refresh-qr-payment" label={qrBusy ? 'Checking Laravel…' : 'Check Payment Status'} onPress={() => void checkQrPayment()} disabled={qrBusy} style={styles.fullButton} />
                  <AppButton testID="cancel-qr-payment" label="Cancel QR Payment" onPress={() => void cancelQrPayment()} disabled={qrBusy} variant="secondary" style={styles.fullButton} />
                </View>
              ) : null}
              {qrStatus === 'verification' && qrPayment ? (
                <View style={styles.qrActions}>
                  <AppButton testID="retry-qr-verification" label="Retry Payment Verification" onPress={() => void checkQrPayment()} disabled={qrBusy} style={styles.fullButton} />
                  <AppButton testID="cancel-qr-payment" label="Cancel QR Payment" onPress={() => void cancelQrPayment()} disabled={qrBusy} variant="secondary" style={styles.fullButton} />
                </View>
              ) : null}
              {qrTerminal ? (
                <AppButton testID="retry-qr-payment" label="Start a New QR Ph Payment" onPress={() => void startQrPayment(true)} disabled={qrBusy} style={styles.fullButton} />
              ) : null}
            </View>
          )}

          <View style={styles.secureRow}>
            <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
            <Text style={styles.secureText}>Only a Laravel-confirmed payment can update stock or transaction history.</Text>
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function QrPayload({ payload }: { payload: string }) {
  const imagePayload = payload.startsWith('data:image/') || /^https?:\/\//i.test(payload);
  if (imagePayload) {
    return <Image testID="qr-payment-image" accessibilityLabel="QR Ph payment code" source={{ uri: payload }} style={styles.qrImage} resizeMode="contain" />;
  }

  return (
    <View testID="qr-payment-payload" style={styles.qrPayloadCard}>
      <Ionicons name="qr-code" size={64} color={colors.text} />
      <Text style={styles.qrPayloadLabel}>Scan this QR Ph payload</Text>
      <Text selectable style={styles.qrPayloadText}>{payload}</Text>
    </View>
  );
}

function qrStatusText(status: QrViewStatus) {
  switch (status) {
    case 'creating': return 'Creating a Laravel payment…';
    case 'pending': return 'Payment pending…';
    case 'paid': return 'Payment confirmed by Laravel. Inventory and history refreshed.';
    case 'failed':
    case 'cancelled':
    case 'expired': return paymentError(status);
    case 'verification': return 'Payment verification needs attention. No local completion was recorded.';
    case 'idle': return '';
  }
}

function verificationMessage(error: unknown) {
  const detail = error instanceof ApiClientError ? error.message : 'Laravel could not be reached.';
  return `Payment status could not be verified. ${detail} Retry verification; do not treat this payment as complete yet.`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dueCard: { backgroundColor: colors.primaryWash, borderRadius: radius.lg, borderWidth: 1, borderColor: '#D9EADB', padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  dueLabel: { color: colors.textMuted, fontSize: typography.label, fontWeight: '700' },
  dueTotal: { color: colors.primary, fontSize: 38, fontWeight: '900', letterSpacing: -1.2, marginTop: 2 },
  dueItems: { color: colors.textMuted, fontSize: typography.caption, marginTop: 3 },
  dueIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.outline },
  orderCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.md, shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  sectionTitle: { color: colors.text, fontSize: typography.title, fontWeight: '900' },
  orderLine: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  orderBorder: { borderTopWidth: 1, borderTopColor: colors.outline },
  orderCopy: { flex: 1, minWidth: 0 },
  orderName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  orderMeta: { color: colors.textMuted, fontSize: 11.5, marginTop: 3 },
  orderAmount: { color: colors.text, fontSize: 15, fontWeight: '900' },
  paymentCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: spacing.md, gap: spacing.md, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  paymentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  helper: { color: colors.primary, fontSize: typography.caption, fontWeight: '700' },
  segmentRow: { flexDirection: 'row', gap: spacing.sm },
  segment: { flex: 1, minHeight: 58, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  segmentActive: { backgroundColor: colors.primaryWash, borderColor: colors.primary },
  segmentText: { flex: 1, color: colors.text, fontSize: typography.label, fontWeight: '800' },
  cashPanel: { gap: spacing.md, paddingTop: 2 },
  label: { color: colors.text, fontSize: typography.label, fontWeight: '800' },
  moneyInputWrap: { minHeight: 62, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.background, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg },
  currency: { color: colors.textMuted, fontSize: 24, fontWeight: '700' },
  input: { flex: 1, minWidth: 0, color: colors.text, fontSize: 25, fontWeight: '900', paddingLeft: spacing.sm },
  changeBox: { minHeight: 68, borderRadius: radius.md, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  changeLabel: { color: colors.textMuted, fontSize: typography.label, fontWeight: '600' },
  changeValue: { color: colors.primary, fontSize: typography.heading, fontWeight: '900' },
  cashError: { color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, fontSize: typography.label, lineHeight: 20, fontWeight: '700' },
  qrPanel: { gap: spacing.md, alignItems: 'center', paddingTop: spacing.sm },
  qrPlaceholder: { width: 184, height: 184, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  qrImage: { width: 184, height: 184, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.white },
  qrPayloadCard: { width: '100%', minHeight: 184, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', padding: spacing.md, gap: spacing.sm },
  qrPayloadLabel: { color: colors.text, fontSize: typography.caption, fontWeight: '800' },
  qrPayloadText: { color: colors.textMuted, fontSize: 10, textAlign: 'center' },
  qrTitle: { color: colors.text, textAlign: 'center', fontSize: typography.title, fontWeight: '900' },
  qrBody: { color: colors.textMuted, textAlign: 'center', fontSize: typography.label, lineHeight: 20, maxWidth: 390 },
  qrStatus: { textAlign: 'center', fontSize: typography.label, fontWeight: '800', lineHeight: 20 },
  qrStatusPaid: { color: colors.primary },
  qrStatusError: { color: colors.danger },
  qrStatusVerification: { color: colors.warning },
  qrError: { color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, fontSize: typography.caption, lineHeight: 18, textAlign: 'center' },
  qrActions: { alignSelf: 'stretch', gap: spacing.sm },
  fullButton: { alignSelf: 'stretch' },
  secureRow: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secureText: { color: colors.textMuted, fontSize: 11, textAlign: 'center', flexShrink: 1 },
  emptyCard: { minHeight: 300, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontSize: typography.heading, fontWeight: '900', textAlign: 'center' },
  emptyBody: { color: colors.textMuted, fontSize: typography.label, lineHeight: 21, textAlign: 'center' },
});
