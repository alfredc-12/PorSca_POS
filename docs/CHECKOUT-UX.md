# Checkout guidance and verification

Checkout remains one existing payment step. Financial results still come only from Laravel v3; the four guidance categories are presentation, not new payment outcomes. Interrupted payments retain their purchase and exact retry keys. Administrator guidance overrides receipt refresh and hides payable QR codes. Back/Leave does not cancel a payment.

## Intentional cashier copy changes

The approved everyday wording replaces older shop-server/operator/verification explanations:

- Pending: “We are still waiting for the payment.” Secondary `qr-payment-status` stays “Payment pending…”.
- Recording: “Recording this payment. Please wait.”
- Cash pending: “We are still waiting for this cash sale.”
- Receipt refresh: “The sale is recorded. Updating stock and history.”
- Received, not recorded: “Payment is received. Still recording the sale.”
- QR completion: “Payment confirmed. Stock and history updated.” This intentionally replaces the old technical success sentence in the manual oracle.
- Conflict: “Conflicting payment records found. This purchase is locked.”
- Administrator instruction: “Call the shop administrator now.”

Unknown/failed checks now say “Payment interrupted”, not payment failure. Uncertain cash no longer claims that nothing was charged or saved. Guidance replaces duplicate failure cards; support codes remain readable. Existing tender accessibility labels and QR start/check/new-attempt/leave identifiers keep their meanings.

The automated evidence and agreed human manual sheet remain the payment-validation gate. The manual sheet must be reconciled to the exact new mobile/API pair by its owners; this change neither executes nor approves that sheet, starts a QA cycle, enables provider flags, nor promotes staging. Native process death and actual optical scanning remain manual evidence, not Jest claims.
