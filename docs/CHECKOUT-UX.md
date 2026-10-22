# Checkout guidance and verification

Checkout remains one existing payment step. Financial results still come only from Laravel v3; the five guidance categories are presentation, not new payment outcomes. Interrupted payments retain their purchase and exact retry keys. Administrator guidance overrides receipt refresh and hides payable QR codes. Back/Leave does not cancel a payment.

## Cart retention across cancel and recovery

The draft cart belongs to the cashier. It is cleared by a completed sale or an explicit Clear All, never as a side effect of ending a retained purchase.

- **Cancel keeps the cart.** `abandonCheckout` abandons the retained purchase and retires its device handle, but leaves every edited cart line (and any Clear All undo) in place. The checkout then shows that cart ready to ring up as a new sale.
- **A failed cancel is not payment uncertainty.** A failed cancellation is reported as unconfirmed, not as an uncertain payment: the purchase may still be open and payment stays locked. While the cancellation guidance is the active explanation, the cashier can retry cancel (which keeps the cart) or recover the earlier basket (which replaces it); a live tender warning still comes first.
- **A cancelled purchase can only be cleared.** Recovery of an already-`abandoned` checkout does not apply its dead basket to the cart and does not clear the cart; it retires the device handle and leaves the cart as the cashier left it. A cancelled purchase has no ring-up path. While the cancelled notice is up, the amount due and order summary come from the retained cart, not the cancelled basket, and a failed clear says the purchase is still showing instead of reporting a recovery, unless administrator guidance replaces the card.
- **Explicit recovery of an open purchase replaces the cart** with that purchase's authoritative basket so it can be paid. That is what **Recover the earlier basket** means; the copy states the replacement, and cancelling is the non-destructive alternative offered beside it.
- **Automatic recovery never replaces a non-empty cart.** It pauses, keeps the listed purchase recoverable, and leaves the cart untouched. Its POS notice states only what was observed (the pause and the kept cart), never an unverified payment outcome.
- **A live tender outranks divergence.** Pending or unknown money keeps its warning and actions; a terminal cancelled purchase and an unconfirmed cancellation outrank the changed-basket guidance. Only when none of those applies does **The cart changed** appear, with the single copy source in `src/domain/checkoutDivergenceCopy.ts`.

The changed-basket copy therefore says what the app does: no payment was taken for the edited cart, cancelling keeps it, recovering an open purchase replaces the edited cart with the earlier basket, and an already-cancelled purchase cannot be recovered.

## Intentional cashier copy changes

The approved everyday wording replaces older shop-server/operator/verification explanations:

- Pending: “We are still waiting for the payment.” Secondary `qr-payment-status` stays “Payment pending…”.
- Recording: “Recording this payment. Please wait.”
- Cash pending: “We are still waiting for this cash sale.”
- Receipt refresh: “The sale is recorded. Updating stock and history.”
- Received, not recorded: “Payment is received. Still recording the sale.”
- QR completion: “Payment confirmed. Stock and history updated.” This intentionally replaces the old technical success sentence in the manual oracle.
- Conflict: “Conflicting payment records found. This purchase is locked.”
- Administrator instruction: “Call the shop administrator now.” Administrator cases hide every payment and cancellation action; the phone only shows the instruction, safety line, and support code. The server-side exception procedure is in [ADMIN-RECONCILIATION.md](ADMIN-RECONCILIATION.md); the app offers no local override or stock adjustment.
- Changed basket: “The cart changed after this purchase was opened.” A cart edit after a durable purchase is refused with `checkout_basket_diverged`, not payment uncertainty; a live pending or unknown tender keeps its own warning first. Guidance, sale help, tender lock, failure card and automatic-recovery wording all come from `src/domain/checkoutDivergenceCopy.ts`; cancelling keeps this cart, recovering an open purchase replaces it with the earlier basket, and an already-cancelled purchase cannot be recovered.

Unknown/failed checks now say “Payment interrupted”, not payment failure. Uncertain cash no longer claims that nothing was charged or saved. Guidance replaces duplicate failure cards; support codes remain readable. Technical checkout, attempt, and case IDs are not shown to cashiers. Existing tender accessibility labels and QR start/check/new-attempt/leave identifiers keep their meanings.

Secondary price review, general recovery, and cancellation options are behind the collapsed **Need help with this sale?** section; state-specific next steps remain in checkout guidance. Cancellation asks for an 8–500-character reason, and the normal payment actions remain primary. Which basket the amount due and order summary show follows [cart retention](#cart-retention-across-cancel-and-recovery).

## Bounded checks, reads and receipt completion

Automatic QR checks use settle-then-timeout delays of 2.5, 5, 10 and 15 seconds (then capped at 15). Only a focused, active, authoritatively pending attempt is eligible. Unknown, completion, received money, administrator cases and verified non-payability stop the scheduler. Manual checks are immediate unless a shared checkout operation is already running; a pending manual result waits at least five seconds before another scheduled check. No timer establishes a payment result.

Overlapping unfiltered catalog, inventory and sales refreshes share provider-local promises. Observing a new committed sale advances the read generation, so earlier reads cannot satisfy confirmation or overwrite newer results. Promises are released on both success and failure. A successful post-sale history read supplies one immediate Transactions mount handoff only when its sale generation is still current and durable checkout retirement also succeeds; otherwise Transactions performs its normal mount read. This is not a general cache, and Retry history remains a real refresh.

A committed QR whose required reads failed retains its purchase. `retry-qr-verification` intentionally becomes **Retry receipt refresh**. It runs stored recovery plus inventory/history reads, never a provider verification POST. While refreshing, **Refreshing receipt…** is disabled. Required reads must succeed before QR retirement and completion. A contradiction seen during recovery overrides the receipt and locks the purchase. `paid_unfulfilled` refreshes inventory/history reads only; it never writes stock, records a sale, or creates another payment, and its lock cannot be cleared by a later observation.

Cash returns the authoritative receipt without waiting for nonblocking inventory/history reads. Its success does not claim stock/history refresh. Failed handle retirement preserves the committed receipt and recovery identity, never requests another payment. Completed cash and QR render receipt facts in the native completion alert and retained completion card, rather than an empty cart or payable QR. Either Done action navigates once to Transactions, and the receipt stays rendered until that screen leaves, so the swap to an empty cart never lands in the same commit as the route change. Completion snapshots and alert deduplication are provider-local display state, cleared on acknowledgement/new cart/sign-out; they are not persisted financial truth.

Checkout has its own memoized context; catalog/search/history updates do not change that value. Order summary and QR rendering are memoized on their own inputs. Component render counts prove structural isolation, not device FPS or optical scanability. QR size, correction, quiet zone, byte limit and image replacement/error behavior are unchanged.

## Evidence and remaining manual gate

Run the focused checkout/machine/durable/context/QR/guidance/polling/read-sharing/Transactions suites, then `npm run verify`. The 561-test baseline is a floor; updated copy assertions keep their original safety, key, lock and race requirements. New tests include slow calls, focus/background cleanup, manual overlap, generation races, receipt-refresh remount, exact uncertain cash replay, administrator precedence, receipt retention and duplicate Done/alerts.

The automated evidence and agreed human manual sheet remain the payment-validation gate. The manual sheet must be reconciled to the exact new mobile/API pair by its owners; this change neither executes nor approves that sheet, starts a QA cycle, enables provider flags, nor promotes staging. Native process death and actual optical scanning remain manual evidence, not Jest claims.
