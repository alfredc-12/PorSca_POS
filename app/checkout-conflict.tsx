import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CheckoutReasonModal } from '@/src/components/CheckoutReasonModal';
import { DataState } from '@/src/components/DataState';
import { Screen } from '@/src/components/Screen';
import { usePos } from '@/src/context/PosContext';
import { canCancelCheckout, checkoutBadge, isOpenCheckout } from '@/src/domain/salesHolds';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function CheckoutConflictScreen() {
  const { checkoutId } = useLocalSearchParams<{ checkoutId?: string }>();
  const {
    cart,
    total,
    authorityCheckout,
    recoverableCheckouts,
    checkoutListState,
    checkoutListError,
    retainedCheckoutId,
    refreshCheckouts,
    recoverCheckout,
    cancelDiscoveredCheckout,
    clearCancelledCheckout,
  } = usePos();
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();

  const checkout = useMemo(() => {
    if (checkoutId) return recoverableCheckouts.find(item => item.id === checkoutId) ?? (authorityCheckout?.id === checkoutId ? authorityCheckout : undefined);
    return authorityCheckout ?? recoverableCheckouts[0];
  }, [authorityCheckout, checkoutId, recoverableCheckouts]);

  useEffect(() => { if (!checkout) void refreshCheckouts(); }, [checkout, refreshCheckouts]);

  const resumeEarlier = async () => {
    if (!checkout) return;
    if (retainedCheckoutId && retainedCheckoutId !== checkout.id) {
      setNotice('Another retained device purchase must be resolved first. No cart was changed.');
      return;
    }
    setBusy(true);
    setNotice(undefined);
    try {
      await recoverCheckout(checkout.id);
      router.replace('/checkout');
    } catch {
      setNotice('The earlier purchase could not be resumed. Its server status is unchanged; refresh and review it again.');
    } finally {
      setBusy(false);
      setConfirmReplace(false);
    }
  };

  const cancelEarlier = async () => {
    if (!checkout || reason.trim().length < 8 || reason.trim().length > 500) return;
    setBusy(true);
    setNotice(undefined);
    try {
      await cancelDiscoveredCheckout(checkout.id, reason);
      setShowCancel(false);
      setReason('');
      router.replace('/pos');
    } catch {
      setNotice('The shop server did not confirm cancellation. The current cart was kept; check the earlier purchase status before continuing.');
    } finally {
      setBusy(false);
    }
  };

  const clearEarlier = async () => {
    if (!checkout) return;
    setBusy(true);
    setNotice(undefined);
    try {
      await clearCancelledCheckout(checkout.id);
      router.replace('/pos');
    } catch {
      setNotice('The shop server has not confirmed that this purchase is cancelled. Nothing was cleared.');
    } finally {
      setBusy(false);
    }
  };

  const loading = !checkout && (checkoutListState === 'idle' || checkoutListState === 'loading');
  const currentSubtotal = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);

  return (
    <Screen title="Resolve basket conflict" subtitle="The earlier saved purchase and this POS cart are separate. Choose one explicit next step.">
      <View accessibilityRole="alert" style={styles.safetyNotice}>
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.warning} />
        <Text style={styles.safetyText}>Do not ring up this cart while the earlier purchase remains open. Baskets cannot be merged. Payment status comes only from the shop server.</Text>
      </View>
      {notice ? <View accessibilityRole="alert" style={styles.errorNotice}><Text style={styles.errorText}>{notice}</Text></View> : null}
      {loading ? <DataState kind="loading" title="Finding the earlier purchase" message="Checking the retained server checkout." /> : null}
      {!loading && !checkout ? (
        <DataState kind="unavailable" title="Earlier purchase unavailable" message={checkoutListError ?? 'Refresh Sales/Holds to find the checkout. The current cart has not been changed.'} actionLabel="Retry discovery" onAction={() => void refreshCheckouts()} />
      ) : null}
      {checkout ? (
        <>
          <View style={styles.comparison}>
            <BasketPanel title="Earlier saved purchase" badge={checkoutBadge(checkout)} amount={checkout.amountCentavos / 100} items={checkout.items.map(item => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPriceCentavos / 100 }))} />
            <BasketPanel title="Current POS cart" badge={`${cart.length} ${cart.length === 1 ? 'line' : 'lines'}`} amount={currentSubtotal} items={cart.map(line => ({ name: line.product.name, quantity: line.quantity, unitPrice: line.product.price }))} emptyLabel="The cart is empty." />
          </View>
          {checkout.state === 'abandoned' ? (
            <View style={styles.actionPanel}>
              <Text style={styles.actionTitle}>This earlier purchase is already cancelled.</Text>
              <Text style={styles.actionBody}>Clear its retained identity and keep the current POS cart. The server cancellation remains the only status authority.</Text>
              <PrimaryAction testID="clear-cancelled-purchase" label="Clear cancelled purchase" icon="trash-outline" onPress={() => void clearEarlier()} disabled={busy} variant="secondary" />
            </View>
          ) : isOpenCheckout(checkout) ? (
            <View style={styles.actionPanel}>
              <Text style={styles.actionTitle}>Choose one basket. No quantities are combined.</Text>
              {confirmReplace ? (
                <View style={styles.confirmPanel}>
                  <Text style={styles.confirmTitle}>Replace the current POS cart?</Text>
                  <Text style={styles.actionBody}>This discards the cart currently on screen and restores the earlier server checkout exactly. You can still review its server quote before payment.</Text>
                  <View style={styles.actionButtons}>
                    <PrimaryAction label="Keep current cart" icon="arrow-back-outline" onPress={() => setConfirmReplace(false)} disabled={busy} variant="secondary" />
                    <PrimaryAction testID="confirm-replace-cart" label="Confirm replace & resume" icon="checkmark-outline" onPress={() => void resumeEarlier()} disabled={busy} />
                  </View>
                </View>
              ) : (
                <View style={styles.actionButtons}>
                  <PrimaryAction testID="replace-cart-and-resume" label="Replace cart and resume earlier purchase" icon="arrow-forward-circle-outline" onPress={() => setConfirmReplace(true)} disabled={busy} />
                  {canCancelCheckout(checkout) ? (
                    <PrimaryAction testID="cancel-earlier-keep-cart" label="Cancel earlier purchase and keep current cart" icon="close-circle-outline" onPress={() => { setReason(''); setShowCancel(true); }} disabled={busy} variant="danger" />
                  ) : (
                    <View style={styles.lockedChip}><Ionicons name="lock-closed" size={15} color={colors.warning} /><Text style={styles.lockedText}>Earlier payment is unresolved or requires review; cancellation is unavailable.</Text></View>
                  )}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.actionPanel}>
              <Text style={styles.actionTitle}>This purchase cannot be resumed here.</Text>
              <Text style={styles.actionBody}>Review its status in Sales/Holds. The current POS cart remains unchanged.</Text>
              <PrimaryAction label="Back to Sales/Holds" icon="archive-outline" onPress={() => router.replace('/sales-holds')} disabled={busy} variant="secondary" />
            </View>
          )}
          <View style={styles.footerNote}><Ionicons name="information-circle-outline" size={18} color={colors.primary} /><Text style={styles.footerText}>Current cart subtotal ₱{total.toFixed(2)}. No payment can be recorded for it until the earlier purchase is resolved.</Text></View>
        </>
      ) : null}
      <CheckoutReasonModal
        visible={showCancel}
        title="Cancel the earlier purchase?"
        description="Enter an attributed reason. The server accepts cancellation only while this checkout is open or ready for tender; an in-flight payment stays locked."
        submitLabel="Cancel earlier purchase"
        reason={reason}
        onChangeReason={setReason}
        onCancel={() => { setShowCancel(false); setReason(''); }}
        onSubmit={() => void cancelEarlier()}
        submitting={busy}
        testID="conflict-cancel-reason"
      />
    </Screen>
  );
}

function BasketPanel({ title, badge, amount, items, emptyLabel = 'No items in this basket.' }: { title: string; badge: string; amount: number; items: { name: string; quantity: number; unitPrice: number }[]; emptyLabel?: string }) {
  return (
    <View style={styles.basketPanel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text numberOfLines={2} style={styles.panelBadge}>{badge}</Text>
      <View style={styles.panelItems}>
        {items.length ? items.map((item, index) => (
          <View key={`${item.name}-${index}`} style={styles.panelItem}>
            <Text style={styles.panelItemName}>{item.name} × {item.quantity}</Text>
            <Text style={styles.panelItemPrice}>₱{(item.unitPrice * item.quantity).toFixed(2)}</Text>
          </View>
        )) : <Text style={styles.emptyLabel}>{emptyLabel}</Text>}
      </View>
      <View style={styles.panelTotalRow}><Text style={styles.panelTotalLabel}>Total</Text><Text style={styles.panelTotal}>₱{amount.toFixed(2)}</Text></View>
    </View>
  );
}

function PrimaryAction({ label, icon, onPress, disabled = false, variant = 'primary', testID }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'danger'; testID?: string }) {
  const buttonStyle = variant === 'danger' ? styles.dangerButton : variant === 'secondary' ? styles.secondaryButton : styles.primaryButton;
  const textStyle = variant === 'danger' ? styles.dangerButtonText : variant === 'secondary' ? styles.secondaryButtonText : styles.primaryButtonText;
  const iconColor = variant === 'primary' ? colors.white : variant === 'danger' ? colors.danger : colors.text;
  return <Pressable testID={testID} accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.actionButton, buttonStyle, disabled && styles.disabled]}><Ionicons name={icon} size={18} color={iconColor} /><Text style={textStyle}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safetyNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  safetyText: { flex: 1, color: colors.text, lineHeight: 20, fontWeight: '700' },
  errorNotice: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  errorText: { color: colors.danger, lineHeight: 20, fontWeight: '700' },
  comparison: { flexDirection: 'row', alignItems: 'stretch', flexWrap: 'wrap', gap: spacing.sm },
  basketPanel: { flexGrow: 1, flexBasis: '47%', minWidth: 150, gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface },
  panelTitle: { color: colors.text, fontSize: 14, fontWeight: '900', lineHeight: 19 },
  panelBadge: { alignSelf: 'flex-start', color: colors.primary, fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  panelItems: { flex: 1, gap: spacing.sm },
  panelItem: { gap: 4, paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.outline },
  panelItemName: { color: colors.text, fontSize: 12, fontWeight: '700' },
  panelItemPrice: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  emptyLabel: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  panelTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.outline },
  panelTotalLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  panelTotal: { color: colors.text, fontSize: 16, fontWeight: '900' },
  actionPanel: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface },
  actionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  actionBody: { color: colors.textMuted, lineHeight: 20 },
  actionButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  confirmPanel: { gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryWash },
  confirmTitle: { color: colors.text, fontWeight: '900' },
  lockedChip: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  lockedText: { flex: 1, color: '#805800', fontSize: 12, fontWeight: '800', lineHeight: 18 },
  actionButton: { minHeight: 50, maxWidth: '100%', flexGrow: 1, flexBasis: 160, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill },
  primaryButton: { backgroundColor: colors.primary },
  primaryButtonText: { color: colors.white, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  secondaryButton: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.outline },
  secondaryButtonText: { color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  dangerButton: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: '#F3BFC3' },
  dangerButtonText: { color: colors.danger, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: 0.45 },
  footerNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryWash },
  footerText: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
});
