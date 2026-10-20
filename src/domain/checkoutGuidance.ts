import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { CheckoutMachine } from './checkoutMachine';

export type CheckoutProgress = {
  uncertainTender?: 'cash' | 'qrph';
  cashInput?: string;
  recoveryFailure?: 'interrupted' | 'identity' | 'inconsistent' | 'permission';
  /** The cart diverged from the retained basket; no tender was sent for it. */
  basketDiverged?: boolean;
};
export type GuidanceAction = 'check' | 'start' | 'cash-retry' | 'recover' | 'refresh' | 'wait' | 'done' | 'administrator';
export type CheckoutGuidance = {
  category: 'pending' | 'interrupted' | 'completed' | 'administrator' | 'changed';
  headline: string; body: string; safety: string;
  action: GuidanceAction; label: string;
  locked: boolean; admin: boolean;
};
export function checkoutGuidance(input: {
  authority?: AuthorityCheckout; machine?: CheckoutMachine; progress?: CheckoutProgress;
  operation?: 'cash' | 'qr-create' | 'check' | 'recover';
  receipt?: 'running' | 'failed' | 'ready'; verificationFailed?: boolean; configured?: boolean; method?: 'cash' | 'qrph';
}): CheckoutGuidance | undefined {
  const { authority, machine, progress = {}, operation, receipt } = input;
  const active = machine?.attempts[machine.attempts.length - 1];
  const qr = progress.uncertainTender ? progress.uncertainTender === 'qrph' : active ? active.method === 'qr' : input.method === 'qrph';
  const make = (category: CheckoutGuidance['category'], body: string, safety: string, action: GuidanceAction, label: string): CheckoutGuidance => ({
    category, headline: category === 'administrator' ? 'Administrator required' : category === 'changed' ? 'The cart changed' : `Payment ${category}`,
    body, safety, action, label, locked: true, admin: category === 'administrator',
  });
  const admin = (body: string, setup = false) => make('administrator', body,
    setup ? 'Do not take payment or hand over goods until the administrator fixes this phone.' : 'Do not take another payment, hand over goods, refund, or abandon this purchase while you wait.', 'administrator', 'Call the shop administrator now.');
  if (authority?.state === 'paid_unfulfilled' || machine?.state === 'paid-but-unfulfilled') return admin('Payment was received, but the sale could not be completed.');
  if (machine?.reconciliationRequired || authority?.state === 'provider_contradiction' || authority?.attempts.some(a => a.status === 'contradiction') || progress.recoveryFailure === 'inconsistent') return admin('Conflicting payment records found. This purchase is locked.');
  if (progress.recoveryFailure === 'identity') return admin('This phone cannot recover the payment record safely. The result is not confirmed.');
  if (input.configured === false || progress.recoveryFailure === 'permission') return admin('This phone needs shop setup or permission before it can record a payment.', true);
  if ((machine?.state === 'completed' || authority?.state === 'completed') && (!authority?.sale || String(authority.sale.id) !== machine?.saleId)) return admin('Conflicting payment records found. This purchase is locked.');
  if (progress.uncertainTender === 'qrph') return operation === 'qr-create'
    ? make('pending', 'Recording this payment. Please wait.', 'Do not submit another payment.', 'wait', 'Creating QR Ph Payment…')
    : make('interrupted', 'We could not confirm the payment status. The customer may still be charged.', 'Do not take another payment or hand over the goods.', 'start', 'Retry QR Ph Payment');
  const sale = machine?.state === 'completed' && authority?.sale && String(authority.sale.id) === machine.saleId;
  if (sale) {
    if (authority.sale!.method === 'cash' || receipt === 'ready') return make('completed', authority.sale!.method === 'cash' ? 'Cash payment and sale are recorded.' : 'Payment confirmed. Stock and history updated.', '', 'done', 'Done');
    if (receipt === 'running') return make('pending', 'The sale is recorded. Updating stock and history.', 'Do not submit another payment.', 'wait', 'Refreshing receipt…');
    return make('interrupted', receipt === 'failed' ? 'The sale is recorded. Stock or history could not be refreshed.' : 'The sale is recorded. Refresh stock and history before continuing.', 'Do not take another payment. Keep this purchase open until the refresh succeeds.', 'refresh', receipt === 'failed' ? 'Retry receipt refresh' : 'Refresh receipt');
  }
  const safety = 'Do not take another payment or hand over the goods yet.';
  if (operation === 'cash' || operation === 'qr-create') return make('pending', 'Recording this payment. Please wait.', 'Do not submit another payment.', 'wait', operation === 'cash' ? 'Recording Cash Payment…' : 'Creating QR Ph Payment…');
  if (active?.finalEvidence?.outcome === 'paid') return make('pending', 'Payment is received. Still recording the sale.', safety, qr ? 'check' : 'recover', qr ? 'Check Payment Status' : 'Recover device purchase');
  if (progress.recoveryFailure === 'interrupted' || input.verificationFailed || active?.payment === 'unknown' || progress.uncertainTender) {
    if (!active && !progress.uncertainTender && !input.verificationFailed) return make('interrupted', 'We could not confirm this purchase. Keep it open and try recovery again.', 'Do not take another payment or hand over the goods.', 'recover', 'Recover device purchase');
    if (!qr) {
      const retryCash = progress.cashInput && !machine?.attempts.some(attempt => attempt.method === 'cash');
      return make('interrupted', 'The cash sale may already be recorded. We could not confirm the result.', 'Keep the cash received. Do not take another payment or hand over the goods.', retryCash ? 'cash-retry' : 'recover', retryCash ? 'Retry saving cash payment' : 'Recover device purchase');
    }
    return make('interrupted', 'We could not confirm the payment status. The customer may still be charged.', 'Do not take another payment or hand over the goods.', active ? 'check' : 'start', active ? 'Check Payment Status' : 'Retry QR Ph Payment');
  }
  if (active?.payment === 'pending') return make('pending', qr ? 'We are still waiting for the payment.' : 'We are still waiting for this cash sale.', qr ? safety : `Keep the cash received. ${safety}`, qr ? 'check' : 'recover', qr ? 'Check Payment Status' : 'Recover device purchase');
  // A basket that no longer matches the retained purchase is not payment
  // uncertainty: nothing was tendered, so the cashier is asked to recover or
  // abandon the retained basket rather than to guard against lost money.
  if (progress.basketDiverged) return make('changed', 'The cart changed after this purchase was opened, so the earlier basket was kept. No payment was taken for this cart.', 'Recover the open purchase to ring up the earlier basket, or cancel that purchase before ringing up this cart.', 'recover', 'Recover the earlier basket');
  return undefined;
}
