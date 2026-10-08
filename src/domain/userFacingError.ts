/**
 * The one module that owns user-facing failure copy.
 *
 * A cashier never sees a database exception, a JavaScript error, or a payment
 * provider's decline code; support still gets a short code that maps back to
 * the raw detail through the on-device diagnostics list
 * (src/observability/diagnostics.ts). The module is pure: no React, no
 * network, no storage. Callers render `title`, `body`, `actionLabel`, and the
 * optional `reference`, and hand `internal` to the diagnostics record.
 *
 * Plan: data/porsca-mobile-feedback-plain-20261004/report.md, §6.1.
 */

export type Failure = {
  status?: number;
  code?: string;
  message?: string;
  details?: unknown;
};

export type FailureScreen =
  | 'sign-in'
  | 'session-restore'
  | 'session-expired'
  | 'cash-sale'
  | 'qr-verification'
  | 'qr-payment'
  | 'product-save'
  | 'staff-list'
  | 'staff-save'
  | 'shop-server';

export type FailureAction =
  | 'retry'
  | 'check-transactions'
  | 'sign-in'
  | 'fix-fields'
  | 'check-payment'
  | 'new-payment'
  | 'contact-operator'
  | 'none';

export type DescribedFailure = {
  title: string;
  body: string;
  actionLabel: string;
  action: FailureAction;
  reference?: string;
  internal: Failure;
};

/**
 * Crockford-style alphabet without 0/1/I/L/O/U, so a code read aloud or written
 * on a receipt cannot be mistyped into a different valid code.
 */
const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const REFERENCE_LENGTH = 6;

/** `PRS-` plus six unambiguous characters, e.g. `PRS-4K7Q2M`. */
export function newReference(random: () => number = Math.random): string {
  let suffix = '';
  for (let index = 0; index < REFERENCE_LENGTH; index += 1) {
    const value = Math.min(REFERENCE_ALPHABET.length - 1, Math.max(0, Math.floor(random() * REFERENCE_ALPHABET.length)));
    suffix += REFERENCE_ALPHABET[value];
  }
  return `PRS-${suffix}`;
}

/** True when a code was issued and a human may need to quote it to support. */
function shouldIssueReference(failure: Failure, screen: FailureScreen): boolean {
  if (failure.code === 'server_not_configured') return false;
  if (screen === 'session-expired') return false;
  if (screen === 'sign-in' || screen === 'session-restore') {
    // A rejected password or an account that cannot sign in is already plain
    // and needs no follow-up; a connection problem may.
    return failure.status !== 400 && failure.status !== 401 && failure.status !== 403 && failure.status !== 422 && failure.status !== 429;
  }
  return true;
}

function normalize(failure: Failure): Failure {
  return {
    ...(failure.status === undefined ? {} : { status: failure.status }),
    ...(failure.code === undefined ? {} : { code: failure.code }),
    ...(failure.message === undefined ? {} : { message: failure.message }),
    ...(failure.details === undefined ? {} : { details: failure.details }),
  };
}

function describeFailureBody(failure: Failure, screen: FailureScreen): Omit<DescribedFailure, 'internal' | 'reference'> {
  // A phone that has not been set up yet is an administrator task, not a
  // server failure: no code and no retry advice the cashier cannot use.
  if (failure.code === 'server_not_configured') {
    return { title: 'This phone is not connected to the shop server yet', body: 'Ask your administrator to finish setup on this device.', actionLabel: '', action: 'none' };
  }
  switch (screen) {
    case 'sign-in':
      if (failure.status === 429) {
        return { title: 'Too many sign-in attempts', body: 'Wait a moment, then try signing in again.', actionLabel: 'Try again', action: 'retry' };
      }
      if (failure.status === 400 || failure.status === 422) {
        return { title: 'Check your sign-in details', body: 'Enter the email address and password exactly as the shop set them up, then try again.', actionLabel: 'Try again', action: 'retry' };
      }
      if (failure.status === 401 || failure.status === 403) {
        return { title: 'Sign-in failed', body: 'The provided credentials are incorrect. Check your email and password, then try again.', actionLabel: 'Try again', action: 'retry' };
      }
      return { title: 'We cannot reach the shop server', body: 'Check the connection, then try again.', actionLabel: 'Try again', action: 'retry' };

    case 'session-restore':
      if (failure.status === 401 || failure.status === 403) {
        return { title: 'You have been signed out', body: 'Your session ended. Sign in again to keep selling.', actionLabel: 'Sign in again', action: 'sign-in' };
      }
      return { title: 'We cannot reach the shop server', body: 'Check the connection, then try again.', actionLabel: 'Try again', action: 'retry' };

    case 'session-expired':
      return { title: 'You have been signed out', body: 'Your session ended. Sign in again to keep selling.', actionLabel: 'Sign in again', action: 'sign-in' };

    case 'cash-sale':
      return cashSaleCopy(failure);

    case 'qr-verification':
      return { title: 'We cannot check this payment yet', body: 'Do not hand over the goods. Check the connection and check again.', actionLabel: 'Check again', action: 'check-payment' };

    case 'qr-payment':
      if (failure.code === 'paid_unfulfilled') {
        return { title: 'Payment received, sale not recorded', body: 'The customer was charged but no sale was saved. Ask the operator to reconcile before refunding.', actionLabel: 'Leave payment', action: 'contact-operator' };
      }
      return { title: "The customer's payment did not go through", body: 'No sale was recorded and stock did not change. Ask the customer to pay another way.', actionLabel: 'Start a new payment', action: 'new-payment' };

    case 'product-save':
      if (failure.status === 422) {
        return { title: 'These details were not accepted', body: 'Fix the highlighted fields, then save again.', actionLabel: 'Fix fields', action: 'fix-fields' };
      }
      if (failure.status !== undefined && failure.status < 500) {
        return { title: 'We could not save this product', body: 'Check the details on this form, then save again.', actionLabel: 'Fix fields', action: 'fix-fields' };
      }
      return { title: 'We could not save this product', body: 'Check the connection, then save again.', actionLabel: 'Try again', action: 'retry' };

    case 'staff-list':
      return { title: 'We could not load the staff list', body: 'Check the connection, then try again.', actionLabel: 'Try again', action: 'retry' };

    case 'staff-save':
      return { title: 'We could not save this account', body: 'Check the connection, then try again.', actionLabel: 'Try again', action: 'retry' };

    case 'shop-server':
      return { title: 'We cannot reach the shop server', body: 'Stock and sales numbers may be out of date. Check the connection, then try again.', actionLabel: 'Try again', action: 'retry' };
  }
}

function cashSaleCopy(failure: Failure): Omit<DescribedFailure, 'internal' | 'reference'> {
  if (failure.code === 'insufficient_stock') {
    return { title: 'Stock changed', body: 'Some items are no longer available. Refresh stock and remove the item, then try again. Your cart is still here.', actionLabel: 'Refresh and remove', action: 'retry' };
  }
  if (failure.code === 'insufficient_cash') {
    return { title: 'Not enough cash', body: 'The amount received is less than the total. Enter the full amount and confirm again. Your cart is still here.', actionLabel: 'Confirm again', action: 'retry' };
  }
  if (failure.code === 'qr_payment_unresolved') {
    return { title: 'Check the QR Ph payment first', body: 'A QR Ph payment for this cart is still unresolved. Check its status before recording cash. Your cart is still here.', actionLabel: 'Check the QR Ph status', action: 'check-payment' };
  }
  if (failure.code === 'cash_attempt_unresolved' || failure.code === 'cash_attempt_already_recorded') {
    return { title: 'Check the earlier attempt first', body: 'An earlier cash sale may already have been saved. Check Transactions before taking payment again. Your cart is still here.', actionLabel: 'Check transactions first', action: 'check-transactions' };
  }
  if (failure.code === 'product_missing') {
    return { title: 'Product no longer available', body: 'A product in this cart is no longer in the catalog. Remove that item from the cart and try again. Your cart is still here.', actionLabel: 'Remove the item', action: 'fix-fields' };
  }
  if (failure.status === 409 || (failure.code?.toLowerCase().includes('idempot') ?? false)) {
    return { title: 'This sale is already being saved', body: 'We are checking whether it went through. Check Transactions before taking payment again. Your cart is still here.', actionLabel: 'Check transactions first', action: 'check-transactions' };
  }
  return { title: 'The sale was not saved', body: 'Nothing was charged and no stock changed. Check the connection, then confirm again. Your cart is still here.', actionLabel: 'Try again', action: 'retry' };
}

/**
 * Describe a failure for a person. `failure.message` and `failure.details` are
 * never placed in the visible copy; they travel through `internal` to the
 * diagnostics record only.
 */
export function describeFailure(failure: Failure, context: { screen: FailureScreen }): DescribedFailure {
  const internal = normalize(failure);
  const described = describeFailureBody(internal, context.screen);
  return shouldIssueReference(internal, context.screen)
    ? { ...described, reference: newReference(), internal }
    : { ...described, internal };
}

/** The support-code line to render beside a described failure, if it has one. */
export function supportCodeLine(failure: DescribedFailure): string | undefined {
  return failure.reference ? `Support code: ${failure.reference}` : undefined;
}

/**
 * A failure that a screen detected itself (no wire payload), phrased through
 * the same shape so rendering and recording stay in one place.
 */
export function localFailure(title: string, body: string, options: { action?: FailureAction; actionLabel?: string } = {}): DescribedFailure {
  return {
    title,
    body,
    action: options.action ?? 'none',
    actionLabel: options.actionLabel ?? '',
    internal: {},
  };
}
