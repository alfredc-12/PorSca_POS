# Administrator reconciliation and exception procedure

This is the exception procedure for a payment that Laravel cannot finish automatically: received money with no sale (`paid_unfulfilled`), or conflicting provider evidence (`provider_contradiction`). It covers NFR-03 and NFR-07, which sit outside the five core modules. Safe handling and an auditable server procedure are in scope; a new administrator module is not.

The phone deliberately has **no** administrator reconciliation screen. Case review, closure, and reopening belong to Laravel's admin API. The mobile client keeps admin-only GET wrappers for reconciliation cases, but no screen calls them and there is no mobile case-mutation method. The phone cannot resolve a case or change a payment, sale, or stock total from this state. A mobile administrator module requires separate scope approval.

## Non-negotiable boundaries

- **No unsafe override.** A locked checkout stays locked. Closing or reopening a reconciliation case never unlocks tender, creates a sale, refunds money, or marks an unresolved attempt as paid. The first verified financial outcome stands.
- **No silent stock adjustment.** Reconciliation is evidence handling, not inventory handling. Neither the phone nor a case `PATCH` changes inventory. Stock changes are a separate, explicit admin catalog action with its own reason and audit trail.
- **Laravel remains the authority.** The mobile client sends no reconciliation write request and exposes no local resolution control. The Laravel admin routes require an active authenticated admin, the v3 contract header, and server-owned store scope.
- **The purchase stays recoverable.** A locked checkout keeps its server checkout ID, attempt evidence, and the phone's recovery handle. The cashier or admin must not discard, abandon, or overwrite it to make the screen usable.

## What the cashier sees

The checkout screen shows **Administrator required** with the safety line:

> Do not take another payment, hand over goods, refund, or abandon this purchase while you wait.

In this state the app hides every payment and cancellation action, including QR start/check/retry, cash confirmation, quote review, and **Cancel this sale**. It may show a support code. The cashier should:

1. Stop the sale and keep the purchase open.
2. Read the support code to the administrator.
3. Wait for the administrator. Do not take cash or QR payment again, hand over goods, refund, or change stock.

Administrator guidance overrides receipt refresh and any completed-looking state. It is not a request to retry payment.

## When the exception applies

Use this procedure when the checkout state or a read-only `exceptions` marker shows a reconciliation case:

- `paid_unfulfilled`: Laravel verified received money but could not create the sale and must not call the payment failed.
- `provider_contradiction`, or an attempt marked `contradiction`: the server has preserved conflicting verified evidence.
- An existing case in `open`, `under_review`, `reopened`, or `resolved` state that is still blocking the checkout.

A setup, identity, permission, or plain connectivity failure is not a reconciliation case. Fix it through the phone/shop setup and recovery procedure; do not open or close a case to hide it.

## Administrator exception procedure

### 1. Identify the case before changing anything

Use an admin session. Confirm the live session and store with `GET /api/v1/checkout-session`, then locate the case:

- `GET /api/v1/reconciliation-cases?per_page=100&page={page}` lists cases for the server store. Page through the result; do not infer "no case" from one page.
- `GET /api/v1/reconciliation-cases/{caseId}` returns `checkoutId`, `attemptId`, `reason`, `state`, `version`, `resolution`, `history`, and `providerHistory`. The read is attributed as a case view.
- `GET /api/v1/checkouts/{checkoutId}` returns read-only `exceptions` markers (`{ caseId, reason, state }`) to both roles. Only the admin case routes reveal the explanation and full provider evidence.

Match by checkout ID, attempt ID, reason, and state. Do not guess from a support code or a similar amount. Record the case ID and current `version` before proceeding.

### 2. Review the evidence

Read the case before writing:

- `providerHistory` contains the first and later observations with event, provider, resource, verification class, actor, and timestamp.
- `history` contains the attributed case actions and prior resolutions.
- The checkout's sale must remain absent for a `paid_unfulfilled` case. A case is not a sale receipt.
- Check whether the first verified outcome stands and whether later evidence is contradictory. Do not replace the first outcome in notes or by retrying payment.
- Confirm that stock has not been changed as part of the case. If stock also needs correction, that is a separate action after this procedure (see below).

If the evidence is incomplete or contradictory, keep the case open and escalate. Do not close it to clear the screen.

### 3. Complete the external remedy

The API records an accountable administrator attestation; it does not refund or fulfill by itself. Complete the actual remedy through the shop's normal channel first:

- external refund;
- external fulfillment (goods handed over or delivered under the approved remedy);
- another verified remedy recorded by the shop.

Keep the external reference (8–500 characters). For an external refund, also keep the external refund reference. Never invent a reference, attest to an unfinished remedy, or label administrator attestation as provider-verified evidence.

### 4. Review, then close or reopen through Laravel

`PATCH /api/v1/reconciliation-cases/{caseId}` requires an integer `version`, an `action`, and a 20–2000-character `explanation`.

- `review`: move an open case to `under_review` with the explanation. Review cannot overwrite a resolved case.
- `close`: close a reviewed case after the remedy is complete. Include the closure evidence:

  ```json
  {
    "version": 1,
    "action": "close",
    "category": "external_refund_confirmed",
    "explanation": "Externally completed refund verified against the named record.",
    "evidenceClass": "administrator_attested",
    "evidenceReference": "refund-ledger-20261008-entry-42",
    "externalReference": "bank-refund-reference-42",
    "attested": true,
    "remedyCompleted": true,
    "evidenceContradictory": false
  }
  ```

  Categories are `external_refund_confirmed`, `external_fulfillment_confirmed`, and `other_verified_remedy`. `external_refund_confirmed` also requires `externalReference`. `provider_verified` is not accepted for external remedies until a verifier exists. `staging_test` is limited to an explicitly approved staging environment.

- `reopen`: reopen a resolved case only when fresh contradictory evidence needs review. The prior resolution and history remain.

Handle refusals without guessing:

| Response | Meaning | Next action |
| --- | --- | --- |
| `409` | Stale `version`; another action won | Re-read the case, review the new evidence, and start again with the current version |
| `422` | Missing, insufficient, unfinished, or contradictory evidence | Correct the evidence; do not retry the same closure |
| `403` | Not an active admin, wrong store, or unapproved staging evidence | Fix the session/scope; do not bypass the guard |
| `404` | Case or checkout outside this store, or wrong identity | Re-locate the case; do not create a replacement by retrying payment |

### 5. Verify the outcome

After closure, re-read the case and the checkout:

- the case is `resolved` and its version/history recorded;
- the checkout's sale and stock are unchanged by the case;
- a paid or contradictory checkout remains locked; closure never makes it payable or turns received money into a sale;
- the phone still retains the recovery handle and shows the appropriate locked state.

If fresh contradictory evidence arrives, the case reopens and the procedure repeats. Do not take another payment while any case is unresolved.

### 6. Record the exception

Keep an operational record with the case ID, checkout ID, attempt ID, case version, action/category, evidence class and reference, operator, time, support code, and outcome. Keep credentials, tokens, provider secrets, and unnecessary customer data out of the record. Staging evidence stays on synthetic QA data; never use live customer or payment data in a disposable worktree.

## Stock corrections are a separate action

A reconciliation case never adjusts stock. The fact that money was received does not authorize a stock write, and closing a case does not "fix" inventory.

If inventory is also wrong, handle it as a separate admin catalog correction:

- use the explicit admin product/inventory action, not a reconciliation request;
- write an absolute non-negative quantity, not a hidden delta;
- record the reason and link the operational change;
- respect Laravel's reserved-stock floor and validation;
- do not combine the correction with a case closure or present it as part of one.

The mobile admin product editor reaches this explicit path through product updates. That is a deliberate admin action with its own authorization, not a silent side effect of reconciliation. Cashiers cannot edit stock.

## Prohibited actions

- Adding a mobile reconciliation `PATCH`, resolve, refund, or stock-adjust control.
- Marking a checkout paid, completed, or resolved from phone state.
- Clearing a reconciliation lock because a new read, timer, navigation, or app restart looks clean.
- Abandoning or discarding a locked checkout to make the screen usable.
- Treating a resolved case as proof that a sale exists, that money was refunded, or that stock changed.
- Changing stock to match a payment or closing a case to match an inventory count.
- Using real customer, production, or staging financial data in local development.

## Implementation guards and tests

The safe-handling implementation is intentionally small:

- `src/domain/checkoutMachine.ts`: a reconciliation lock, sale, and locked attempt ledger are monotonic. A stored observation cannot clear a lock, replace a completed sale with a payable checkout, or change a stored attempt's method/amount. `reconciliation-closed` is always rejected as a local event.
- `src/domain/durableCheckout.ts`: quote review, abandonment, and device-identity retirement are refused while reconciliation is required. A stale observation that clears the lock fails closed as an inconsistent recovery.
- `src/api/client.ts`: reconciliation access is limited to the admin-checked `listReconciliationCases()` and `getReconciliationCase()` GET wrappers. There is no mobile case-mutation method.
- `app/checkout.tsx`: administrator guidance hides payment, QR, quote-review, and cancellation actions and keeps the purchase open.

Regression coverage:

| Test | Evidence |
| --- | --- |
| `src/domain/checkoutMachine.test.ts` | Lock/sale monotonicity, rejected local closure, stored-observation overrides, attempt identity |
| `src/domain/durableCheckout.test.ts` | No revalidate/abandon/retire while locked; stale unlocked observation fails closed |
| `src/context/PosContext.test.tsx` | `paid_unfulfilled` refreshes inventory/history reads only; no stock write, no cash/QR sale, cart and handle retained; revalidate/abandon refused |
| `src/api/checkoutAuthority.test.ts` | Admin checks and GET-only reconciliation requests |
| `__tests__/app/checkout.test.tsx` | Administrator guidance hides every payment and cancellation action |

Run the canonical gate before review:

```bash
npm run verify
```

## Out of scope

- A new mobile administrator module, case list, detail screen, or resolution form.
- A mobile reconciliation write wrapper or any local override.
- Automated refunds, provider outcome injection, or stock changes from reconciliation.
- Changing staging data, promoting a branch, or starting a formal QA cycle.

See [API-CONTRACT.md](API-CONTRACT.md) for the mobile/API resource boundary, [CHECKOUT-UX.md](CHECKOUT-UX.md) for cashier copy, and the API repository's `docs/CHECKOUT-CONTRACT.md` for the authoritative Laravel reconciliation fields and guards.
