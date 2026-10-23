import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { AppButton } from '@/src/components/AppButton';
import { FailureNotice } from '@/src/components/FailureNotice';
import { CheckoutOrderSummary } from '@/src/components/CheckoutOrderSummary';
import { QrPaymentCode } from '@/src/components/QrPaymentCode';
import { QrExpiryCountdown } from '@/src/components/QrExpiryCountdown';
import { ApiClientError, Payment } from '@/src/api/client';
import { useCheckout } from '@/src/context/PosContext';
import { paymentError } from '@/src/domain/pos';
import { cashTenderPresets, formatCheckoutMoney } from '@/src/domain/checkoutMoney';
import { checkoutGuidance } from '@/src/domain/checkoutGuidance';
import { cancellationFailedCopy, cancelledPurchaseCopy, changedBasketCopy, unobservedBasketCopy } from '@/src/domain/checkoutDivergenceCopy';
import { useCheckoutPaymentPolling } from '@/src/hooks/useCheckoutPaymentPolling';
import { canAcceptCheckoutTender, checkoutCashTender } from '@/src/domain/checkoutMachine';
import { canSafelyAbandonCheckout } from '@/src/domain/checkoutCancellation';
import { isDefinitiveQrRejection, saleFailureCopy } from '@/src/domain/checkout';
import { DescribedFailure, localFailure } from '@/src/domain/userFacingError';
import { describeAndRecordFailure } from '@/src/observability/diagnostics';
import { OFFLINE_COPY } from '@/src/config/offline';
import { PaymentStatus, Sale } from '@/src/types';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

type QrViewStatus = PaymentStatus | 'idle' | 'creating' | 'verification';

export default function CheckoutScreen() {
  const { method } = useLocalSearchParams<{ method?: string }>();
  const {
    total,
    cart,
    apiConfigured,
    completeCashSale,
    startQrPhPayment,
    refreshQrPhPayment,
    confirmQrPhPayment,
    unresolvedQrPayment,
    authorityCheckout,
    checkoutMachine,
    checkoutProgress,
    checkoutCompletion,
    acknowledgeCheckout,
    claimCheckoutCompletionAlert,
    recoverCheckout,
    revalidateCheckout,
    abandonCheckout,
    prepareCancellation,
  } = useCheckout();
  const [retainedPayment] = useState(() => unresolvedQrPayment());
  const [selectedMode, setMode] = useState<'cash' | 'qrph'>(() => retainedPayment || method === 'qrph' ? 'qrph' : 'cash');
  const [enteredCash, setCash] = useState('');
  const cash = checkoutProgress?.cashInput ?? enteredCash;
  const [qrStatus, setQrStatus] = useState<QrViewStatus>(retainedPayment?.status ?? 'idle');
  const [qrPayment, setQrPayment] = useState<Payment | undefined>(retainedPayment);
  const [qrError, setQrError] = useState<DescribedFailure>();
  const [qrFailure, setQrFailure] = useState<DescribedFailure>();
  const [cashError, setCashError] = useState<DescribedFailure>();
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const cashBusyRef = useRef(false);
  const qrBusyRef = useRef(false);
  const handledPaidPayment = useRef<string | undefined>(undefined);
  const navigatedDone = useRef(false);
  const visibleRef = useRef(false);
  // Done used to acknowledge the completion and leave in one commit. The native
  // stack is removing this screen then, and swapping the completed receipt for
  // the empty-cart tree in that same commit makes Fabric re-parent the
  // receipt's views inside the outgoing screen (Android: addViewAt ... View
  // already has a parent), which kills the React host. Leave first, and
  // acknowledge once this screen is actually gone.
  const done = useCallback(() => {
    if (navigatedDone.current) return;
    navigatedDone.current = true;
    router.replace('/(tabs)/transactions');
  }, []);
  useEffect(() => () => {
    if (navigatedDone.current) acknowledgeCheckout?.();
  }, [acknowledgeCheckout]);
  // A blocking modal is only ever raised while this screen is focused and the
  // app is in the foreground; a background result stays in the screen state.
  const modalAllowed = useCallback(() => visibleRef.current && AppState.currentState === 'active', []);
  const alertCompletion = useCallback((sale: Sale) => {
    if (!modalAllowed() || handledPaidPayment.current === sale.id) return;
    if (claimCheckoutCompletionAlert && !claimCheckoutCompletionAlert(sale.id)) return;
    handledPaidPayment.current = sale.id;
    Alert.alert('Payment completed', receiptText(sale), [{ text: 'Done', onPress: done }]);
  }, [done, claimCheckoutCompletionAlert, modalAllowed]);

  const recordedTerminalStatus = useRef<string | undefined>(undefined);
  const [cancelledCheckoutId, setCancelledCheckoutId] = useState<string>();
  const authorityObserved = Boolean(authorityCheckout || checkoutMachine);
  const basketCopy = authorityObserved ? changedBasketCopy : unobservedBasketCopy;

  // A cancelled purchase is terminal until another checkout is observed or a
  // new tender starts; only that local acknowledgement belongs to this screen.
  const cancelledPurchase = cancelledCheckoutId !== undefined && (!authorityCheckout || authorityCheckout.id === cancelledCheckoutId);
  const purchaseCancelled = cancelledPurchase || checkoutMachine?.state === 'abandoned' || authorityCheckout?.state === 'abandoned';
  const dueAmountCentavos = purchaseCancelled ? Math.round(total * 100) : authorityCheckout?.amountCentavos ?? Math.round(total * 100);
  const cashResult = useMemo(() => checkoutCashTender(cash, dueAmountCentavos), [cash, dueAmountCentavos]);
  const cashFeedback = cashResult.kind === 'insufficient'
    ? `Short by ${formatCheckoutMoney(cashResult.shortfallCentavos)}. Add cash before confirming.`
    : cashResult.kind === 'invalid'
      ? 'Enter digits and at most two decimal places (for example, 100.00).'
      : cashResult.kind === 'empty' ? 'Enter the cash received or choose a preset.' : undefined;
  const [abandonReason, setAbandonReason] = useState('');
  const [recoveryError, setRecoveryError] = useState<string>();
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [showSaleHelp, setShowSaleHelp] = useState(false);
  const operationRef = useRef(false);
  const [receiptRefresh, setReceiptRefresh] = useState<'running' | 'failed' | 'ready'>();
  const recoveryAction = async (action: () => Promise<void>, failureNotice?: string) => {
    if (operationRef.current || administratorRequired) return;
    operationRef.current = true;
    setRecoveryBusy(true);
    setRecoveryError(undefined);
    try {
      await action();
      const retained = unresolvedQrPayment();
      if (retained) await showQrPayment(retained);
      else { setQrPayment(undefined); setQrStatus('idle'); setQrError(undefined); }
      setCashError(undefined);
    } catch (error) {
      setQrError(describeQrVerification(error));
      setRecoveryError(failureNotice ?? 'We could not recover this purchase. Keep it open and try again before taking payment.');
    }
    finally { operationRef.current = false; setRecoveryBusy(false); }
  };

  // Mirror the authority gate in presentation without replacing any handler
  // guard. A verified non-payable attempt remains eligible for a new tender.
  const authorityTenderLocked = !canAcceptCheckoutTender(checkoutMachine);
  const guidance = checkoutGuidance({ authority: authorityCheckout, machine: checkoutMachine, progress: checkoutProgress,
    operation: cashSubmitting ? 'cash' : qrStatus === 'creating' ? 'qr-create' : recoveryBusy ? 'recover' : qrBusy ? 'check' : undefined,
    receipt: receiptRefresh, verificationFailed: qrStatus === 'verification', configured: apiConfigured, method: selectedMode });
  const administratorRequired = Boolean(guidance?.admin);
  const safeCancellationAvailable = !administratorRequired && !purchaseCancelled && !checkoutProgress?.uncertainTender
    && canSafelyAbandonCheckout(authorityCheckout, checkoutMachine);
  // A changed basket is not payment uncertainty: no tender was sent for it.
  const basketDiverged = Boolean(checkoutProgress?.basketDiverged) && !purchaseCancelled;
  const cancellationFailed = Boolean(checkoutProgress?.cancellationFailed) && !purchaseCancelled;
  // A live tender keeps its own warning; the changed-basket reason only shows
  // when the changed guidance itself is the active explanation.
  const changedBasketActive = basketDiverged && guidance?.category === 'changed';
  const cancellationUnconfirmed = cancellationFailed && guidance?.headline === cancellationFailedCopy.headline;
  const tenderLocked = authorityTenderLocked || Boolean(guidance?.locked) || qrBusy || cashSubmitting || recoveryBusy;
  const operationBusy = qrBusy || cashSubmitting || recoveryBusy;
  const activeAttempt = checkoutMachine?.attempts[checkoutMachine.attempts.length - 1];
  const qrExpiresAt = qrPayment
    ? authorityCheckout?.attempts.find(attempt => attempt.method === 'qrph' && String(attempt.id) === qrPayment.id)?.qrExpiresAt
    : null;
  // Recovery/deep links must display the retained tender, not a route default.
  const mode = checkoutProgress?.uncertainTender ?? (authorityTenderLocked && activeAttempt
    ? activeAttempt.method === 'qr' ? 'qrph' : 'cash'
    : selectedMode);
  const terminalLocked = checkoutMachine?.reconciliationRequired
    || checkoutMachine?.state === 'completed'
    || checkoutMachine?.state === 'abandoned'
    || checkoutMachine?.state === 'paid-but-unfulfilled';
  const tenderLockReason = terminalLocked
    ? 'This purchase is locked. Do not take another payment.'
    : changedBasketActive
      ? basketCopy.tenderLock
      : cancellationUnconfirmed
        ? cancellationFailedCopy.tenderLock
        : 'Do not take another payment while this payment is waiting.';
  const cancellationPreparable = !authorityObserved && !guidance && !administratorRequired && !purchaseCancelled
    && !checkoutProgress?.uncertainTender && !terminalLocked;
  const cancellationEntryAvailable = safeCancellationAvailable || cancellationPreparable;
  const requestCancellation = async () => {
    if (!cancellationPreparable || operationRef.current || administratorRequired) return;
    operationRef.current = true;
    setRecoveryBusy(true);
    setRecoveryError(undefined);
    try { await prepareCancellation(); }
    catch (error) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.code !== 'checkout_basket_diverged') setRecoveryError('We could not prepare this sale for cancellation. Your cart is unchanged. Try again before taking payment.');
    }
    finally { operationRef.current = false; setRecoveryBusy(false); }
  };

  const checkoutItems = purchaseCancelled ? undefined : authorityCheckout?.items;
  const authoritativeCart = useMemo(() => checkoutItems?.map(item => ({
    product: { id: String(item.productId), name: item.name, price: item.unitPriceCentavos / 100, barcode: '', stock: 0 },
    quantity: item.quantity,
  })), [checkoutItems]);
  const displayedCart = authoritativeCart ?? cart;
  const dueItemCount = displayedCart.reduce((sum, line) => sum + line.quantity, 0);
  const presets = useMemo(() => cashTenderPresets(dueAmountCentavos), [dueAmountCentavos]);

  // A refusal because the provider still holds an earlier attempt is not a dead
  // end: show the stored authority attempt with its status check. Ambiguous
  // creation is recoverable by durable checkout id, even without a payment id.
  const surfaceRetainedQrAttempt = useCallback((error: unknown) => {
    const apiError = error instanceof ApiClientError ? error : undefined;
    if (apiError?.code !== 'qr_payment_unresolved') return false;
    const retained = unresolvedQrPayment();
    if (!retained) return false;
    setQrPayment(retained);
    setQrStatus(retained.status === 'paid' ? 'verification' : retained.status);
    setQrError(undefined);
    return true;
  }, [unresolvedQrPayment]);

  const finishCash = async () => {
    setCashError(undefined);
    // Switching tabs does not cancel a QR attempt. Creation and verification
    // errors are unresolved too: the provider may still collect payment.
    // Only a server-confirmed unpaid terminal state permits another tender.
    if (operationRef.current || guidance?.admin || !canAcceptCheckoutTender(checkoutMachine) || checkoutProgress?.uncertainTender === 'qrph') {
      const failure = localFailure('Payment is still waiting', 'Do not take another payment. Check this purchase before accepting cash.');
      setCashError(failure);
      Alert.alert(failure.title, failure.body);
      return;
    }
    // Strict online: no sale can be recorded without Laravel, so a stale or
    // deep-linked checkout can never fall through to a local sale (defect F1).
    if (!apiConfigured) {
      const failure = localFailure('The sale was not saved', OFFLINE_COPY.checkoutNotConfigured, { action: 'retry', actionLabel: 'Try again' });
      setCashError(failure);
      Alert.alert(failure.title, failure.body);
      return;
    }
    if (cashResult.kind !== 'sufficient') return;
    // Single-submit guard: the disabled button state commits a render later,
    // so a second tap before that must not record a second sale.
    if (cashBusyRef.current) return;
    cashBusyRef.current = true;
    operationRef.current = true;
    setCancelledCheckoutId(undefined);
    setCashSubmitting(true);
    try {
      const sale = await completeCashSale(cash);
      if (!sale) {
        const failure = localFailure('The sale was not saved', 'The cart is empty. Return to the POS and add a product before trying again.', { action: 'retry', actionLabel: 'Try again' });
        setCashError(failure);
        if (modalAllowed()) Alert.alert(failure.title, failure.body);
        return;
      }
      alertCompletion(sale);
    } catch (error) {
      surfaceRetainedQrAttempt(error);
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.code === 'revalidation_required' || apiError?.code === 'checkout_basket_diverged') setShowSaleHelp(true);
      const failure = saleFailureCopy({
        status: apiError?.status,
        code: apiError?.code,
        message: apiError?.message,
        details: apiError?.details,
      }, authorityObserved);
      setCashError(failure);
      if (modalAllowed()) Alert.alert(failure.title, alertBody(failure));
    } finally {
      cashBusyRef.current = false;
      operationRef.current = false;
      setCashSubmitting(false);
    }
  };

  const showQrPayment = useCallback(async (payment: Payment) => {
    setMode('qrph');
    setQrPayment(payment);
    setQrStatus(payment.status === 'paid' ? 'verification' : payment.status);
    setQrError(undefined);
    const terminal = payment.status === 'failed' || payment.status === 'cancelled' || payment.status === 'expired';
    if (terminal && recordedTerminalStatus.current !== payment.status) {
      recordedTerminalStatus.current = payment.status;
      setQrFailure(describeAndRecordFailure({ code: payment.status }, { screen: 'qr-payment' }));
    }

    if (payment.status === 'paid_unfulfilled') {
      const failure = describeAndRecordFailure({ code: 'paid_unfulfilled' }, { screen: 'qr-payment' });
      setQrFailure(failure);
      try {
        await confirmQrPhPayment(payment);
        setQrStatus('paid_unfulfilled');
        if (modalAllowed() && handledPaidPayment.current !== payment.id) {
          handledPaidPayment.current = payment.id;
          Alert.alert(failure.title, alertBody(failure));
        }
      } catch (error) {
        setQrStatus('paid_unfulfilled');
        setQrError(describeQrVerification(error));
      }
      return;
    }

    if (payment.status !== 'paid') return;

    setReceiptRefresh('running');
    try {
      const sale = await confirmQrPhPayment(payment);
      if (!sale) throw new Error('No completed receipt was returned.');
      setReceiptRefresh('ready');
      setQrStatus('paid');
      alertCompletion(sale);
    } catch (error) {
      setReceiptRefresh('failed');
      setQrStatus('verification');
      setQrError(describeQrVerification(error));
    }
  }, [confirmQrPhPayment, alertCompletion, modalAllowed]);

  const [authorityViewInputs, setAuthorityViewInputs] = useState<{
    authorityCheckout: typeof authorityCheckout;
    operationBusy: boolean;
    receiptRefresh: typeof receiptRefresh;
    unresolvedQrPayment: typeof unresolvedQrPayment;
    uncertainTender: string | undefined;
  }>();
  const uncertainTender = checkoutProgress?.uncertainTender;
  if (!authorityViewInputs
    || authorityViewInputs.authorityCheckout !== authorityCheckout
    || authorityViewInputs.operationBusy !== operationBusy
    || authorityViewInputs.receiptRefresh !== receiptRefresh
    || authorityViewInputs.unresolvedQrPayment !== unresolvedQrPayment
    || authorityViewInputs.uncertainTender !== uncertainTender) {
    setAuthorityViewInputs({ authorityCheckout, operationBusy, receiptRefresh, unresolvedQrPayment, uncertainTender });
    if (!operationBusy) {
      const retained = unresolvedQrPayment();
      if (!retained) {
        if (uncertainTender === 'qrph') { setMode('qrph'); setQrPayment(undefined); setQrStatus('verification'); }
      } else {
        setMode('qrph');
        setQrPayment(retained);
        setQrStatus(retained.status === 'paid' ? receiptRefresh === 'ready' ? 'paid' : 'verification' : retained.status);
      }
    }
  }

  const startQrPayment = useCallback(async (forceNew = false) => {
    if (operationRef.current || administratorRequired) return;
    operationRef.current = true;
    qrBusyRef.current = true;
    setCancelledCheckoutId(undefined);
    setQrBusy(true);
    setQrStatus('creating');
    setQrError(undefined);
    setQrFailure(undefined);
    recordedTerminalStatus.current = undefined;
    try {
      const payment = await startQrPhPayment(forceNew);
      await showQrPayment(payment);
    } catch (error) {
      if (surfaceRetainedQrAttempt(error)) return;
      if (error instanceof ApiClientError && (error.code === 'revalidation_required' || error.code === 'checkout_basket_diverged')) setShowSaleHelp(true);
      const startFailure = qrStartFailure(error, authorityObserved);
      setQrStatus(startFailure.status);
      setQrError(startFailure.failure);
    } finally {
      operationRef.current = false;
      qrBusyRef.current = false;
      setQrBusy(false);
    }
  }, [showQrPayment, startQrPhPayment, surfaceRetainedQrAttempt, administratorRequired, authorityObserved]);

  const performQrCheck = useCallback(async () => {
    if (!qrPayment || operationRef.current || administratorRequired) return;
    operationRef.current = true;
    qrBusyRef.current = true;
    setQrBusy(true);
    try {
      const payment = await refreshQrPhPayment(qrPayment.id);
      await showQrPayment(payment);
    } catch (error) {
      setQrStatus('verification'); setQrError(describeQrVerification(error));
    } finally {
      operationRef.current = false;
      qrBusyRef.current = false;
      setQrBusy(false);
    }
  }, [qrPayment, refreshQrPhPayment, showQrPayment, administratorRequired]);

  const retryReceiptRefresh = useCallback(async () => {
    const retained = unresolvedQrPayment();
    if (operationRef.current || retained?.status !== 'paid' || administratorRequired || authorityCheckout?.state !== 'completed' || !authorityCheckout.sale
      || String(authorityCheckout.attempts[authorityCheckout.attempts.length - 1]?.id) !== retained.id) return;
    operationRef.current = true;
    qrBusyRef.current = true;
    setQrBusy(true);
    try { await showQrPayment(retained); }
    finally { operationRef.current = false; qrBusyRef.current = false; setQrBusy(false); }
  }, [authorityCheckout, administratorRequired, unresolvedQrPayment, showQrPayment]);

  // Leaving never cancels an attempt. Hold expiry does not establish financial finality.
  const leaveQrPayment = useCallback(() => {
    router.back();
  }, []);

  const { checkNow: checkQrPayment, visible, focused } = useCheckoutPaymentPolling({
    identity: qrPayment ? `${authorityCheckout?.id ?? checkoutMachine?.id}:${qrPayment.id}` : undefined,
    eligible: mode === 'qrph' && qrStatus === 'pending' && activeAttempt?.payment === 'pending' && !activeAttempt.finalEvidence && !terminalLocked && !guidance?.admin && receiptRefresh !== 'running' && receiptRefresh !== 'failed',
    busy: operationBusy, check: performQrCheck,
  });
  useLayoutEffect(() => { visibleRef.current = focused; return () => { visibleRef.current = false; }; }, [focused]);
  useEffect(() => { if (visible && checkoutCompletion && !guidance?.admin) alertCompletion(checkoutCompletion.sale); }, [visible, checkoutCompletion, guidance?.admin, alertCompletion]);

  if (checkoutCompletion && !guidance?.admin) {
    const sale = checkoutCompletion.sale;
    return <Screen title="Checkout" back>
      <View testID="checkout-completed-receipt" style={styles.paymentCard}>
        <View style={styles.headingRow}><Ionicons name="checkmark-circle" size={26} color={colors.primary} /><Text style={styles.sectionTitle}>Payment completed</Text></View>
        {receiptText(sale).split('\n').map(line => <Text key={line}>{line}</Text>)}
        <AppButton label="Done" onPress={done} />
      </View>
    </Screen>;
  }

  if (cart.length === 0 && !guidance) {
    return (
      <Screen title="Checkout" subtitle="There is nothing to pay yet." back>
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><Ionicons name="cart-outline" size={36} color={colors.primary} /></View>
          <Text style={styles.emptyTitle}>The cart is empty</Text>
          <Text style={styles.emptyBody}>Return to the POS and add a product before starting payment.</Text>
          <AppButton label="Recover device purchase" onPress={() => void recoveryAction(() => recoverCheckout())} disabled={recoveryBusy} />
          {recoveryError ? <Text accessibilityRole="alert">{recoveryError}</Text> : null}
          <AppButton testID="return-to-pos" label="Return to POS" onPress={() => router.replace('/(tabs)/pos')} style={styles.fullButton} />
        </View>
      </Screen>
    );
  }

  // The POS already refuses to proceed offline, but this route can also be
  // reached by a deep link or a stale navigation. Block it here too so no
  // checkout path exists without Laravel (defect F1).
  if (!apiConfigured) {
    return (
      <Screen title="Checkout" subtitle="This phone needs shop setup." back>
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><Ionicons name="cloud-offline-outline" size={36} color={colors.warning} /></View>
          <Text style={styles.emptyTitle}>Administrator required</Text>
          <Text testID="checkout-offline-notice" accessibilityRole="alert" style={styles.emptyBody}>
            This phone needs shop setup or permission before it can record a payment. Call the shop administrator now. Do not take payment or hand over goods until the administrator fixes this phone.
          </Text>
          <AppButton testID="return-to-pos-offline" label="Return to POS" onPress={() => router.replace('/(tabs)/pos')} style={styles.fullButton} />
        </View>
      </Screen>
    );
  }

  const qrTerminal = qrStatus === 'failed' || qrStatus === 'cancelled' || qrStatus === 'expired';
  const qrHasPayment = Boolean(qrPayment);

  return (
    <Screen title="Checkout" subtitle="Record payment before handing over the goods." back>
        {guidance ? <View testID="checkout-guidance" style={styles.paymentCard} accessibilityLiveRegion="polite">
          <View style={styles.headingRow}><Ionicons name={guidance.admin ? 'warning-outline' : guidance.category === 'interrupted' ? 'alert-circle-outline' : guidance.category === 'changed' ? purchaseCancelled ? 'close-circle-outline' : 'cart-outline' : 'time-outline'} size={24} color={guidance.admin ? colors.danger : colors.warning} /><Text style={styles.sectionTitle}>{guidance.headline}</Text></View>
          <Text>{guidance.body}</Text>
          <Text>{guidance.safety}</Text>
          {guidance.action === 'administrator' ? <Text>{guidance.label}</Text> : <AppButton
            testID={guidance.action === 'check' ? qrStatus === 'pending' ? 'refresh-qr-payment' : 'retry-qr-verification' : guidance.action === 'start' ? 'start-qrph-payment' : guidance.action === 'refresh' ? 'retry-qr-verification' : undefined}
            label={guidance.action === 'done' ? 'Finish this sale' : guidance.label} disabled={guidance.action === 'wait' || operationBusy}
            onPress={() => { if (guidance.action === 'check') void checkQrPayment(); else if (guidance.action === 'start') void startQrPayment(false); else if (guidance.action === 'refresh') void retryReceiptRefresh(); else if (guidance.action === 'cash-retry') void finishCash(); else if (guidance.action === 'recover' || guidance.action === 'done') void recoveryAction(() => recoverCheckout(), purchaseCancelled ? cancelledPurchaseCopy.clearNotice : undefined); }} />}
          {qrError?.reference || qrFailure?.reference || cashError?.reference ? <Text>Support code: {qrError?.reference ?? qrFailure?.reference ?? cashError?.reference}</Text> : null}
        </View> : null}
        {recoveryError && !guidance?.admin ? <Text accessibilityRole="alert">{recoveryError}</Text> : null}
        {cancelledPurchase ? <Text testID="checkout-cancelled-notice" accessibilityLiveRegion="polite">Checkout cancelled. Your cart is unchanged and ready for a new sale.</Text> : null}
        <View style={styles.dueCard}>
          <View>
            <Text style={styles.dueLabel}>Amount due</Text>
            <Text style={styles.dueTotal}>₱{(dueAmountCentavos / 100).toFixed(2)}</Text>
            <Text style={styles.dueItems}>{dueItemCount} {dueItemCount === 1 ? 'item' : 'items'} in this sale</Text>
          </View>
          <View style={styles.dueIcon}><Ionicons name="bag-check-outline" size={30} color={colors.primary} /></View>
        </View>

        <View style={styles.orderCard}>
          <CheckoutOrderSummary cart={displayedCart} />
        </View>

        {!purchaseCancelled && (guidance?.category === 'interrupted' || guidance?.category === 'changed' || !guidance) ? <View style={styles.orderCard}>
          <Pressable testID="sale-help-toggle" accessibilityRole="button" onPress={() => {
            const opening = !showSaleHelp;
            setShowSaleHelp(opening);
            if (opening) void requestCancellation();
          }}>
            <Text style={styles.sectionTitle}>{showSaleHelp ? 'Hide sale help' : 'Need help with this sale?'}</Text>
          </Pressable>
          {!showSaleHelp ? <Text style={styles.helper}>{changedBasketActive ? basketCopy.helpHint : cancellationUnconfirmed ? cancellationFailedCopy.helpHint : !guidance && !safeCancellationAvailable ? 'Open help to prepare this sale for safe cancellation or recovery. Nothing is cancelled until you confirm a reason.' : 'This sale needs attention. Open help only if the payment was interrupted.'}</Text> : null}
          {!showSaleHelp && cancellationEntryAvailable ? <AppButton testID="cancel-sale-entry" label="Cancel this sale" onPress={() => { setShowSaleHelp(true); void requestCancellation(); }} variant="secondary" /> : null}
          {showSaleHelp ? <>
            <Text style={styles.helper}>These steps keep this sale safe. They never take another payment.</Text>
            {guidance || authorityCheckout ? <>
              <AppButton label="Check the current price" onPress={() => void recoveryAction(() => revalidateCheckout())} disabled={tenderLocked} variant="secondary" />
              <AppButton label="Try recovering this sale" onPress={() => void recoveryAction(() => recoverCheckout())} disabled={operationBusy} variant="secondary" />
            </> : null}
            {safeCancellationAvailable ? <>
              <Text style={styles.label}>Cancel this sale</Text>
              <Text style={styles.helper}>This ends the checkout only; it does not cancel a QR payment. Your cart stays as it is.</Text>
              <Text style={styles.helper}>Tell us briefly what happened so the shop can review it later (8–500 characters).</Text>
              <TextInput testID="cancel-sale-reason-input" accessibilityLabel="What happened with this sale" placeholder="What happened (at least 8 characters)" value={abandonReason} onChangeText={setAbandonReason} maxLength={500} editable={!operationBusy} />
              <AppButton testID="confirm-cancel-sale" label="Confirm cancellation" onPress={() => {
                const reason = abandonReason.trim();
                if (safeCancellationAvailable && reason.length >= 8 && reason.length <= 500) {
                  void recoveryAction(async () => {
                    const abandoned = await abandonCheckout(reason);
                    if (abandoned.state === 'abandoned') setCancelledCheckoutId(abandoned.id);
                  }, cancellationFailedCopy.notice);
                }
              }} disabled={operationBusy || abandonReason.trim().length < 8 || abandonReason.trim().length > 500} variant="secondary" />
            </> : recoveryBusy && cancellationPreparable ? <Text testID="cancel-sale-preparing" accessibilityLiveRegion="polite">Preparing this sale for safe cancellation…</Text>
              : basketDiverged && !authorityObserved ? <Text testID="cancel-sale-unavailable" accessibilityRole="text">{unobservedBasketCopy.helpUnavailable}</Text>
                : cancellationPreparable ? null
                  : !guidance?.admin ? <Text testID="cancel-sale-unavailable" accessibilityRole="text">
                    Cancellation is unavailable while this purchase is unresolved. Use the payment-status or recovery action above, or Leave Payment where shown; do not take another payment.
                  </Text> : null}
          </> : null}
        </View> : null}

        <View style={styles.paymentCard}>
          <View style={styles.paymentHeader}>
            <View style={styles.headingRow}><Ionicons name="card-outline" size={23} color={colors.primary} /><Text style={styles.sectionTitle}>Payment Method</Text></View>
            <Text style={styles.helper}>Choose one</Text>
          </View>
          <View style={styles.segmentRow}>
            <Pressable testID="checkout-payment-cash" accessibilityRole="button" accessibilityLabel="Pay with cash" accessibilityState={{ selected: mode === 'cash', disabled: (guidance?.admin || tenderLocked && mode !== 'cash') }} disabled={(guidance?.admin || tenderLocked && mode !== 'cash')} onPress={() => { if (!tenderLocked) setMode('cash'); }} style={[styles.segment, mode === 'cash' && styles.segmentActive, (guidance?.admin || tenderLocked && mode !== 'cash') && styles.segmentDisabled]}>
              <Ionicons name="cash-outline" size={22} color={mode === 'cash' ? colors.primary : colors.textMuted} />
              <Text style={styles.segmentText}>Cash</Text>
              <Ionicons name={mode === 'cash' ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={mode === 'cash' ? colors.primary : colors.outline} />
            </Pressable>
            <Pressable testID="checkout-payment-qrph" accessibilityRole="button" accessibilityLabel="Pay with QR Ph" accessibilityState={{ selected: mode === 'qrph', disabled: (guidance?.admin || tenderLocked && mode !== 'qrph') }} disabled={(guidance?.admin || tenderLocked && mode !== 'qrph')} onPress={() => { if (!tenderLocked) setMode('qrph'); }} style={[styles.segment, mode === 'qrph' && styles.segmentActive, (guidance?.admin || tenderLocked && mode !== 'qrph') && styles.segmentDisabled]}>
              <Ionicons name="qr-code-outline" size={22} color={mode === 'qrph' ? colors.primary : colors.textMuted} />
              <Text style={styles.segmentText}>QR Ph</Text>
              <Ionicons name={mode === 'qrph' ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={mode === 'qrph' ? colors.primary : colors.outline} />
            </Pressable>
          </View>

          {tenderLocked ? <Text testID="checkout-tender-lock-reason" accessibilityLiveRegion="polite" style={styles.tenderLockReason}>{tenderLockReason}</Text> : null}

          {mode === 'cash' ? (
            <View style={styles.cashPanel}>
              <Text style={styles.label}>Cash received</Text>
              <View style={styles.moneyInputWrap}>
                <Text style={styles.currency}>₱</Text>
                <TextInput
                  testID="cash-received-input"
                  value={cash}
                  onChangeText={setCash}
                  editable={!tenderLocked}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  accessibilityLabel="Cash received"
                />
              </View>
              {cashFeedback ? <Text testID="cash-tender-feedback" accessibilityLiveRegion="polite">{cashFeedback}</Text> : null}
              <View style={styles.segmentRow}>
                {presets.map(preset => <Pressable key={preset.label} accessibilityRole="button" accessibilityLabel={`Cash ${preset.label}`} disabled={tenderLocked} onPress={() => { if (!tenderLocked) setCash(preset.input); }}><Text>{preset.label}</Text></Pressable>)}
              </View>
              <View style={styles.changeBox}>
                <Text style={styles.changeLabel}>Change to customer</Text>
                <Text style={styles.changeValue}>{cashResult.kind === 'sufficient' ? `₱${(cashResult.changeCentavos / 100).toFixed(2)}` : '—'}</Text>
              </View>
              {cashError && !guidance ? <FailureNotice testID="checkout-cash-error" failure={cashError} /> : null}
              <AppButton
                testID="confirm-cash-payment"
                label={cashSubmitting ? 'Recording Cash Payment…' : 'Confirm Cash Payment'}
                onPress={finishCash}
                disabled={tenderLocked || recoveryBusy || cashResult.kind !== 'sufficient'}
                style={styles.fullButton}
              />
            </View>
          ) : (
            <View style={styles.qrPanel}>
              {guidance?.admin || authorityCheckout?.sale ? null : qrPayment?.qrPayload ? <QrPaymentCode payload={qrPayment.qrPayload} /> : (
                <View style={styles.qrPlaceholder}>
                  <Ionicons name="qr-code" size={112} color={colors.text} />
                </View>
              )}
              <Text style={styles.qrTitle}>Practice QR — not payable</Text>
              <Text testID="qr-practice-notice" style={styles.qrBody}>Practice display only — not payable. Do not scan this QR to pay. Its image or expiry does not confirm payment; check the payment status. Leaving does not cancel an attempt.</Text>
              <QrExpiryCountdown key={`${qrPayment?.id ?? 'no-attempt'}:${qrExpiresAt ?? ''}`} expiresAt={qrExpiresAt} />
              {qrStatus !== 'idle' ? (
                <Text testID="qr-payment-status" accessibilityLiveRegion="polite" style={[styles.qrStatus, qrStatus === 'paid' ? styles.qrStatusPaid : qrStatus === 'paid_unfulfilled' ? styles.qrStatusReconcile : qrStatus === 'verification' ? styles.qrStatusVerification : styles.qrStatusError]}>
                  {receiptRefresh === 'running' ? 'Payment pending…' : qrStatusText(qrStatus)}
                </Text>
              ) : null}
              {qrError && !guidance ? <FailureNotice testID="qr-payment-error" failure={qrError} /> : null}
              {qrFailure && !guidance ? <FailureNotice testID="qr-payment-failure" failure={qrFailure} /> : null}
              {!guidance && (qrStatus === 'idle' || qrStatus === 'verification' && !qrHasPayment) ? (
                <AppButton testID="start-qrph-payment" label={qrStatus === 'verification' ? 'Retry QR Ph Payment' : 'Start QR Ph Payment'} onPress={() => void startQrPayment(false)} disabled={qrBusy || cashSubmitting} style={styles.fullButton} />
              ) : null}
              {!guidance && qrStatus === 'creating' ? (
                <AppButton testID="start-qrph-payment" label="Creating QR Ph Payment…" onPress={() => undefined} disabled style={styles.fullButton} />
              ) : null}
              {!guidance && qrStatus === 'pending' && qrPayment ? (
                <View style={styles.qrActions}>
                  <AppButton testID="refresh-qr-payment" label={qrBusy ? 'Checking…' : 'Check Payment Status'} onPress={() => void checkQrPayment()} disabled={qrBusy} style={styles.fullButton} />
                  <AppButton testID="leave-qr-payment" label="Leave Payment" onPress={() => leaveQrPayment()} disabled={qrBusy} variant="secondary" style={styles.fullButton} />
                </View>
              ) : null}
              {!guidance && (qrStatus === 'verification' || qrStatus === 'unknown') && qrPayment ? (
                <View style={styles.qrActions}>
                  <AppButton testID="retry-qr-verification" label="Retry Payment Verification" onPress={() => void checkQrPayment()} disabled={qrBusy} style={styles.fullButton} />
                  <AppButton testID="leave-qr-payment" label="Leave Payment" onPress={() => leaveQrPayment()} disabled={qrBusy} variant="secondary" style={styles.fullButton} />
                </View>
              ) : null}
              {!guidance && qrStatus === 'paid_unfulfilled' && qrPayment ? (
                <View style={styles.qrActions}>
                  <AppButton testID="refresh-qr-payment" label={qrBusy ? 'Checking…' : 'Check Payment Status'} onPress={() => void checkQrPayment()} disabled={qrBusy} style={styles.fullButton} />
                  <AppButton testID="leave-qr-payment" label="Leave Payment" onPress={() => leaveQrPayment()} disabled={qrBusy} variant="secondary" style={styles.fullButton} />
                </View>
              ) : null}
              {!guidance && qrTerminal ? (
                <View style={styles.qrActions}>
                  <AppButton testID="retry-qr-payment" label="Start a New QR Ph Payment" onPress={() => void startQrPayment(true)} disabled={qrBusy || cashSubmitting} style={styles.fullButton} />
                  <AppButton testID="leave-qr-payment" label="Leave Payment" onPress={() => leaveQrPayment()} disabled={qrBusy} variant="secondary" style={styles.fullButton} />
                </View>
              ) : null}
            </View>
          )}

          {guidance && mode === 'qrph' ? <AppButton testID="leave-qr-payment" label="Leave Payment" onPress={leaveQrPayment} disabled={operationBusy} variant="secondary" /> : null}
          <View style={styles.secureRow}>
            <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
            <Text style={styles.secureText}>Stock and history change only after the sale is recorded.</Text>
          </View>
        </View>
    </Screen>
  );
}

function receiptText(sale: Sale) {
  const facts = [sale.paymentMethod === 'cash' ? 'Cash payment and sale are recorded.' : 'Payment confirmed. Stock and history updated.', `Receipt ${sale.id}`, `Paid ₱${sale.total.toFixed(2)}`];
  if (sale.paymentMethod === 'cash') facts.push(`Cash received ₱${sale.cashReceived!.toFixed(2)}`, `Change to give ₱${sale.change!.toFixed(2)}`);
  else facts.push('Payment method: QR Ph');
  return facts.join('\n');
}

function qrStatusText(status: QrViewStatus) {
  switch (status) {
    case 'creating': return 'Creating a QR Ph payment…';
    case 'pending': return 'Payment pending…';
    case 'paid': return 'Payment confirmed. Stock and history updated.';
    case 'unknown': return 'Payment interrupted';
    case 'paid_unfulfilled': return 'Administrator required';
    case 'failed':
    case 'cancelled':
    case 'expired': return paymentError(status);
    case 'verification': return 'Payment interrupted';
    case 'idle': return '';
  }
}

function describeQrVerification(error: unknown): DescribedFailure {
  const apiError = error instanceof ApiClientError ? error : undefined;
  return apiError
    ? describeAndRecordFailure(
        { status: apiError.status, code: apiError.code, message: apiError.message, details: apiError.details },
        { screen: 'qr-verification' },
      )
    : localFailure('We cannot check this payment yet', 'Do not hand over the goods. Check the connection and check again.', { action: 'check-payment', actionLabel: 'Check again' });
}

/**
 * A failed QR start either created no attempt, left its outcome unresolved, or
 * was refused because an earlier cash attempt still is. The refusals created
 * no QR attempt, so they return the panel to idle instead of inventing a QR
 * verification state; a transport or server outcome stays unresolved.
 */
function qrStartFailure(error: unknown, basketObserved?: boolean): { status: QrViewStatus; failure: DescribedFailure } {
  const apiError = error instanceof ApiClientError ? error : undefined;
  if (apiError?.code === 'cash_attempt_unresolved' || apiError?.code === 'revalidation_required' || apiError?.code === 'checkout_basket_diverged' || apiError?.code === 'checkout_purchase_cancelled') {
    return {
      status: 'idle',
      failure: describeAndRecordFailure(
        { status: apiError.status, code: apiError.code, message: apiError.message, details: apiError.details },
        { screen: 'cash-sale', basketObserved },
      ),
    };
  }
  if (apiError && isDefinitiveQrRejection(apiError)) {
    return {
      status: 'idle',
      failure: describeAndRecordFailure(
        { status: apiError.status, code: apiError.code, message: apiError.message, details: apiError.details },
        { screen: 'qr-payment' },
      ),
    };
  }
  return { status: 'verification', failure: describeQrVerification(error) };
}

/** The alert body: the visible copy, plus the support code when one was issued. */
function alertBody(failure: DescribedFailure): string {
  return failure.reference ? `${failure.body}\n\nSupport code: ${failure.reference}` : failure.body;
}

const styles = StyleSheet.create({
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
  segmentDisabled: { opacity: 0.5 },
  tenderLockReason: { color: colors.textMuted, fontSize: typography.label, lineHeight: 20 },
  segmentText: { flex: 1, color: colors.text, fontSize: typography.label, fontWeight: '800' },
  cashPanel: { gap: spacing.md, paddingTop: 2 },
  label: { color: colors.text, fontSize: typography.label, fontWeight: '800' },
  moneyInputWrap: { minHeight: 62, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.background, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg },
  currency: { color: colors.textMuted, fontSize: 24, fontWeight: '700' },
  input: { flex: 1, minWidth: 0, color: colors.text, fontSize: 25, fontWeight: '900', paddingLeft: spacing.sm },
  changeBox: { minHeight: 68, borderRadius: radius.md, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  changeLabel: { color: colors.textMuted, fontSize: typography.label, fontWeight: '600' },
  changeValue: { color: colors.primary, fontSize: typography.heading, fontWeight: '900' },
  qrPanel: { gap: spacing.md, alignItems: 'center', paddingTop: spacing.sm },
  qrPlaceholder: { width: 184, height: 184, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  qrTitle: { color: colors.text, textAlign: 'center', fontSize: typography.title, fontWeight: '900' },
  qrBody: { color: colors.textMuted, textAlign: 'center', fontSize: typography.label, lineHeight: 20, maxWidth: 390 },
  qrStatus: { textAlign: 'center', fontSize: typography.label, fontWeight: '800', lineHeight: 20 },
  qrStatusPaid: { color: colors.primary },
  qrStatusReconcile: { color: colors.warning },
  qrStatusError: { color: colors.danger },
  qrStatusVerification: { color: colors.warning },
  qrActions: { alignSelf: 'stretch', gap: spacing.sm },
  fullButton: { alignSelf: 'stretch' },
  secureRow: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secureText: { color: colors.textMuted, fontSize: 11, textAlign: 'center', flexShrink: 1 },
  emptyCard: { minHeight: 300, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontSize: typography.heading, fontWeight: '900', textAlign: 'center' },
  emptyBody: { color: colors.textMuted, fontSize: typography.label, lineHeight: 21, textAlign: 'center' },
});
