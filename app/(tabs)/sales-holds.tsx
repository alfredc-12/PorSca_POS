import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { CheckoutReasonModal } from '@/src/components/CheckoutReasonModal';
import { DataState } from '@/src/components/DataState';
import { Screen } from '@/src/components/Screen';
import { usePos } from '@/src/context/PosContext';
import { canCancelCheckout, cancellationMarkerUnclearedNotice, checkoutBadge, isOpenCheckout, isPaymentLocked, shortCheckoutId } from '@/src/domain/salesHolds';
import { CancellationMarkerUnclearedError } from '@/src/domain/durableCheckout';
import { colors, radius, spacing } from '@/src/theme/tokens';
import { CartLine } from '@/src/types';

export default function SalesHoldsScreen() {
  const {
    cart,
    recoverableCheckouts,
    checkoutListState,
    checkoutListError,
    checkoutRecoveryError,
    activeCheckoutCount,
    retainedCheckoutId,
    parkedCheckoutId,
    refreshCheckouts,
    checkCheckoutStatus,
    recoverCheckout,
    cancelDiscoveredCheckout,
    clearCancelledCheckout,
  } = usePos();
  const [notice, setNotice] = useState<string>();
  const [cancelTarget, setCancelTarget] = useState<AuthorityCheckout>();
  const [cancelReason, setCancelReason] = useState('');
  const [busyId, setBusyId] = useState<string>();

  useEffect(() => { void refreshCheckouts(); }, [refreshCheckouts]);

  const resumeSale = useCallback(async (checkout: AuthorityCheckout) => {
    if (!isOpenCheckout(checkout)) return;
    if (retainedCheckoutId && retainedCheckoutId !== checkout.id) {
      router.push({ pathname: '/checkout-conflict', params: { checkoutId: retainedCheckoutId } });
      return;
    }
    if (cart.length && !cartMatchesCheckout(cart, checkout)) {
      router.push({ pathname: '/checkout-conflict', params: { checkoutId: checkout.id } });
      return;
    }
    setBusyId(checkout.id);
    setNotice(undefined);
    try {
      await recoverCheckout(checkout.id);
      router.push('/checkout');
    } catch {
      setNotice('This purchase could not be resumed. Its status remains unresolved; refresh the list and try again.');
    } finally {
      setBusyId(undefined);
    }
  }, [cart, recoverCheckout, retainedCheckoutId]);

  const checkStatus = useCallback(async (checkout: AuthorityCheckout) => {
    setBusyId(checkout.id);
    setNotice(undefined);
    try {
      await checkCheckoutStatus(checkout.id);
      setNotice(`Status refreshed for ${shortCheckoutId(checkout.id)} from the shop server.`);
    } catch {
      setNotice('The shop server could not confirm this status. The previous status is not a new payment result; retry when connected.');
    } finally {
      setBusyId(undefined);
    }
  }, [checkCheckoutStatus]);

  const submitCancellation = useCallback(async () => {
    if (!cancelTarget || cancelReason.trim().length < 8 || cancelReason.trim().length > 500) return;
    const target = cancelTarget;
    setBusyId(target.id);
    setNotice(undefined);
    try {
      await cancelDiscoveredCheckout(target.id, cancelReason);
      setCancelTarget(undefined);
      setCancelReason('');
      setNotice(`Cancellation was accepted by the shop server for ${shortCheckoutId(target.id)}. The current POS cart was kept.`);
    } catch (error) {
      if (error instanceof CancellationMarkerUnclearedError) {
        setCancelTarget(undefined);
        setCancelReason('');
        setNotice(cancellationMarkerUnclearedNotice);
      } else {
        setNotice('The shop server did not confirm cancellation. The purchase may still be open; check status before continuing.');
      }
    } finally {
      setBusyId(undefined);
    }
  }, [cancelDiscoveredCheckout, cancelReason, cancelTarget]);

  const clearCancelled = useCallback(async (checkout: AuthorityCheckout) => {
    setBusyId(checkout.id);
    setNotice(undefined);
    try {
      await clearCancelledCheckout(checkout.id);
      setNotice(`Cancelled purchase ${shortCheckoutId(checkout.id)} was cleared from this device list. No payment outcome was inferred.`);
    } catch (error) {
      setNotice(error instanceof CancellationMarkerUnclearedError
        ? cancellationMarkerUnclearedNotice
        : 'The shop server did not confirm that this purchase was cancelled. Nothing was cleared.');
    } finally {
      setBusyId(undefined);
    }
  }, [clearCancelledCheckout]);

  const refresh = useCallback(async () => {
    setNotice(undefined);
    const refreshed = await refreshCheckouts();
    if (!refreshed) setNotice('Saved purchases could not be refreshed. Existing cards, if any, remain unchanged.');
  }, [refreshCheckouts]);

  const loading = (checkoutListState === 'idle' || checkoutListState === 'loading') && recoverableCheckouts.length === 0;
  const listError = checkoutListError ?? checkoutRecoveryError;
  const actionsDisabled = Boolean(busyId) || checkoutListState === 'loading';

  return (
    <Screen title="Sales/Holds" subtitle="Saved purchases stay with the shop server. Review what is safe next before continuing.">
      {notice ? <View accessibilityRole="alert" style={styles.notice}><Ionicons name="information-circle-outline" size={19} color={colors.primary} /><Text style={styles.noticeText}>{notice}</Text></View> : null}
      {listError && recoverableCheckouts.length > 0 ? (
        <View accessibilityRole="alert" style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>{listError}</Text>
          <ActionButton label="Retry list" icon="refresh-outline" onPress={() => void refresh()} disabled={actionsDisabled} variant="secondary" />
        </View>
      ) : null}
      {checkoutRecoveryError && recoverableCheckouts.length === 0 ? <View accessibilityRole="alert" style={styles.inlineError}><Text style={styles.inlineErrorText}>{checkoutRecoveryError}</Text><ActionButton label="Retry recovery" icon="refresh-outline" onPress={() => void refresh()} disabled={actionsDisabled} variant="secondary" /></View> : null}
      {loading ? <DataState kind="loading" title="Checking saved purchases" message="Reading current checkout status from the shop server." /> : null}
      {checkoutListState === 'unavailable' && recoverableCheckouts.length === 0 ? (
        <DataState kind="unavailable" title="Saved purchases are unavailable" message={listError ?? 'Connect to the shop server and retry. No local payment result is shown.'} actionLabel="Retry list" onAction={() => void refresh()} />
      ) : null}
      {checkoutListState === 'ready' && recoverableCheckouts.length === 0 && !checkoutRecoveryError ? (
        <DataState kind="no-results" title="No saved purchases found" message="New sales and parked checkouts will appear here after the shop server records them." />
      ) : null}
      {recoverableCheckouts.map(checkout => {
        const badge = checkoutBadge(checkout);
        const canCancel = canCancelCheckout(checkout);
        const locked = isPaymentLocked(checkout);
        const localParked = checkout.id === parkedCheckoutId;
        const localMarker = checkout.id === retainedCheckoutId || localParked;
        const busy = busyId === checkout.id;
        return (
          <View key={checkout.id} testID={`checkout-card-${checkout.id}`} style={styles.checkoutCard}>
            <View style={styles.cardTop}>
              <View style={styles.identityRow}>
                <View style={styles.idBadge}><Text style={styles.idBadgeText}>#{shortCheckoutId(checkout.id)}</Text></View>
                {localParked ? <View style={styles.parkedBadge}><Text style={styles.parkedBadgeText}>Parked</Text></View> : null}
              </View>
              <StatusBadge label={badge} />
            </View>
            <View style={styles.itemsPreview}>
              {checkout.items.slice(0, 4).map(item => (
                <View key={`${checkout.id}-${item.productId}`} style={styles.previewRow}>
                  <Text numberOfLines={1} style={styles.itemName}>{item.name} × {item.quantity}</Text>
                  <Text style={styles.itemTotal}>₱{(item.unitPriceCentavos * item.quantity / 100).toFixed(2)}</Text>
                </View>
              ))}
              {checkout.items.length > 4 ? <Text style={styles.moreItems}>+{checkout.items.length - 4} more items</Text> : null}
              {checkout.items.length === 0 ? <Text style={styles.emptyItems}>No item preview was returned by the shop server.</Text> : null}
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Server checkout total</Text>
              <Text style={styles.totalAmount}>₱{(checkout.amountCentavos / 100).toFixed(2)}</Text>
            </View>
            {locked ? <View style={styles.lockedChip}><Ionicons name="lock-closed" size={14} color={colors.warning} /><Text style={styles.lockedText}>{badge === 'Admin review' ? 'Locked for administrator review' : 'Payment unresolved • cancellation unavailable'}</Text></View> : null}
            <View style={styles.cardActions}>
              {isOpenCheckout(checkout) ? <ActionButton testID={`resume-${checkout.id}`} label={busy ? 'Working…' : 'Resume sale'} icon="play-circle-outline" onPress={() => void resumeSale(checkout)} disabled={actionsDisabled} /> : null}
              <ActionButton testID={`check-status-${checkout.id}`} label={busy ? 'Checking…' : 'Check status'} icon="refresh-outline" onPress={() => void checkStatus(checkout)} disabled={actionsDisabled} variant="secondary" />
              {canCancel ? <ActionButton testID={`cancel-${checkout.id}`} label="Cancel sale" icon="close-circle-outline" onPress={() => { setCancelTarget(checkout); setCancelReason(''); }} disabled={actionsDisabled} variant="danger" /> : null}
              {checkout.state === 'abandoned' && localMarker ? <ActionButton testID={`clear-cancelled-${checkout.id}`} label="Clear cancelled" icon="trash-outline" onPress={() => void clearCancelled(checkout)} disabled={actionsDisabled} variant="secondary" /> : null}
            </View>
          </View>
        );
      })}
      {checkoutListState === 'loading' && recoverableCheckouts.length > 0 ? <Text accessibilityLiveRegion="polite" style={styles.refreshing}>Refreshing saved purchases…</Text> : null}
      <View style={styles.footerNote}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
        <Text style={styles.footerText}>The shop server is the authority for payment and sale status. An expired QR or hold never unlocks an unresolved payment.</Text>
      </View>
      <View style={styles.listFooter}>
        <Text style={styles.countText}>{activeCheckoutCount} active {activeCheckoutCount === 1 ? 'sale or hold' : 'sales or holds'}</Text>
        <ActionButton testID="refresh-sales-holds" label="Refresh list" icon="refresh-outline" onPress={() => void refresh()} disabled={actionsDisabled} variant="secondary" />
      </View>
      <CheckoutReasonModal
        visible={Boolean(cancelTarget)}
        title="Cancel this sale?"
        description="The shop server will record this reason. Only an open or ready checkout can be cancelled; payment in flight stays locked."
        submitLabel="Send cancellation"
        reason={cancelReason}
        onChangeReason={setCancelReason}
        onCancel={() => { setCancelTarget(undefined); setCancelReason(''); }}
        onSubmit={() => void submitCancellation()}
        submitting={Boolean(busyId)}
        testID="sales-holds-cancel-reason"
      />
    </Screen>
  );
}

function cartMatchesCheckout(cart: CartLine[], checkout: AuthorityCheckout) {
  const current = cart.map(line => [String(line.product.id), line.quantity]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const saved = checkout.items.map(item => [String(item.productId), item.quantity]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify(current) === JSON.stringify(saved);
}

function StatusBadge({ label }: { label: string }) {
  const variant = label === 'Admin review' ? styles.badgeAdmin : label === 'Payment waiting' ? styles.badgeWaiting : label === 'Payment interrupted' ? styles.badgeInterrupted : label === 'Cancelled' ? styles.badgeCancelled : label === 'Completed' ? styles.badgeCompleted : styles.badgeReady;
  return <View accessibilityLabel={`Status: ${label}`} style={[styles.statusBadge, variant]}><Text style={styles.statusBadgeText}>{label}</Text></View>;
}

function ActionButton({ label, icon, onPress, disabled = false, variant = 'primary', testID }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'danger'; testID?: string }) {
  const buttonStyle = variant === 'danger' ? styles.dangerButton : variant === 'secondary' ? styles.secondaryButton : styles.primaryButton;
  const textStyle = variant === 'danger' ? styles.dangerButtonText : variant === 'secondary' ? styles.secondaryButtonText : styles.primaryButtonText;
  const iconColor = variant === 'primary' ? colors.white : variant === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable testID={testID} accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.actionButton, buttonStyle, disabled && styles.disabled]}>
      <Ionicons name={icon} size={17} color={iconColor} />
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryWash },
  noticeText: { flex: 1, color: colors.text, lineHeight: 20, fontWeight: '600' },
  inlineError: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  inlineErrorText: { color: colors.text, lineHeight: 20, fontWeight: '600' },
  checkoutCard: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  idBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.text },
  idBadgeText: { color: colors.white, fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  parkedBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  parkedBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  statusBadgeText: { fontSize: 11, fontWeight: '900' },
  badgeReady: { backgroundColor: colors.primarySoft, borderColor: '#B9DEC6' },
  badgeWaiting: { backgroundColor: colors.blueSoft, borderColor: '#BCD8F7' },
  badgeInterrupted: { backgroundColor: colors.warningSoft, borderColor: '#EBD28B' },
  badgeAdmin: { backgroundColor: colors.dangerSoft, borderColor: '#F3BFC3' },
  badgeCancelled: { backgroundColor: colors.surfaceMuted, borderColor: colors.outline },
  badgeCompleted: { backgroundColor: colors.primaryWash, borderColor: '#B9DEC6' },
  itemsPreview: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.background },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  itemName: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
  itemTotal: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  moreItems: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  emptyItems: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  totalAmount: { color: colors.text, fontSize: 19, fontWeight: '900' },
  lockedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.warningSoft },
  lockedText: { color: '#805800', fontSize: 11, fontWeight: '800' },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: spacing.md, borderRadius: radius.pill },
  primaryButton: { backgroundColor: colors.primary },
  primaryButtonText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  secondaryButton: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.outline },
  secondaryButtonText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  dangerButton: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: '#F3BFC3' },
  dangerButtonText: { color: colors.danger, fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  refreshing: { color: colors.textMuted, textAlign: 'center', fontSize: 12 },
  footerNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryWash },
  footerText: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  listFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  countText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
});
