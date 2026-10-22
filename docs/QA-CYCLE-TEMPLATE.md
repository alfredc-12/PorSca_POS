# PorSca formal QA cycle template

This file is a reusable record template, not an active QA cycle. Repository setup and ordinary feature development must not create or start a formal cycle.

The designated human release owner creates a copy only after selecting a paired mobile/API candidate on `staging` and deciding to begin formal testing. The release owner chooses the cycle ID and QA owner. FirstMate and coding agents may prepare evidence, but they do not start, approve, or promote a cycle.

See [WORKFLOW.md](WORKFLOW.md) for the standing collaboration and release rules and the API repository's `docs/QA-CYCLE.md` for the paired backend record.

## Cycle details

- **Cycle ID:** `<human-selected cycle ID>`
- **Spec:** [PorSca issue 1](https://github.com/alfredc-12/PorSca_POS/issues/1)
- **QA owner:** `<designated human tester>`
- **Release owner:** `<human release owner>`
- **Environment:** `staging`
- **Staging API address:** `<configured Lightsail HTTPS origin ending in /api/v1; not the literal <domain> placeholder>`
- **API deployment evidence:** `<manual workflow URL, dispatched full SHA, timestamped external health result with matching commit and staging/database/sandbox/status fields>`
- **Mobile artifact:** `<EAS build ID/link, bundled API origin, native runtime/build, applied OTA update ID or none>`
- **Documentation traceability:** `section 6.2; section 7; Test Plan 2.1` — see [DEPLOYMENT.md](DEPLOYMENT.md)
- **Break-glass exception:** `<none, or human-authorized temporary origin and reason; never an implicit switch from Lightsail>`
- **App profile:** `preview`, after the pre-build checklist is green
- **API contract:** `porsca-mobile-api-v3`
- **Cycle status:** `not started | in progress | approval pending | approved | rejected`
- **Approval:** `<human decision, date, and evidence links>`

## Paired candidate

Use exact full commit SHAs. Do not test a different pair without creating or updating a cycle record for the new candidate.

| Side | Branch | Full commit SHA | Commit link |
| --- | --- | --- | --- |
| Mobile | `staging` | `<mobile SHA>` | `<mobile commit URL>` |
| API | `staging` | `<API SHA>` | `<API commit URL>` |

Confirm the recorded SHAs before testing. Branch names alone are not sufficient evidence.

## Data and payment context

- **API seed/data version:** `<seed version printed by the API reset command>`
- **API migration set:** `<migration revision or identifier>`
- **Mobile fallback seed reference:** `<only when relevant to the candidate>`
- **PayMongo mode:** `sandbox`
- **Sandbox account/context:** `<label or vault reference, never a secret>`
- **Webhook context:** `<label or vault reference, never a secret>`
- **Webhook reachability:** `<checked result>`

Reset and seed the isolated staging database once before the cycle. Preserve it for the duration of the cycle. Never put API tokens, PayMongo keys, webhook secrets, or authorization headers in this record.

If sandbox credentials are unavailable, practice-labeled QR results may be recorded as setup evidence, but formal payment approval remains pending. A later change in PayMongo context requires a new cycle record.

## Pre-build checklist

Use the five required checks in [WORKFLOW.md](WORKFLOW.md#previewstaging-build-gate). A connectivity preview build may precede the formal cycle record and Postman/Newman follow-up; it is not yet a formal SQA candidate. When this record is created, attach the prior pre-build evidence:

- [ ] Mobile and API CI are tied to the exact paired candidate SHAs.
- [ ] The deployed Lightsail staging API answers health and required routes, with health commit matching the paired API SHA.
- [ ] The isolated staging database has been reset and seeded with the recorded version.
- [ ] The baseline will not be reset or reseeded during this cycle; retain the changes produced by testing for reproduction.
- [ ] Mobile CI is green for the exact mobile candidate.
- [ ] API CI and `composer verify` are green for the exact API candidate.
- [ ] PayMongo sandbox configuration and webhook reachability are recorded.
- [ ] PayMongo sandbox keys are present server-side and the sandbox webhook is registered/enabled.
- [ ] The human release owner authorizes the preview build on the recorded pre-build results.

Only the human release owner may authorize the manual preview build after this checklist is green.

```bash
eas build --profile preview --platform android
```

## Before formal SQA (after a connectivity preview build if needed)

- [ ] The exact mobile and API SHAs are recorded and still available on `staging`.
- [ ] Postman/Newman backend checks pass against the recorded staging address.
- [ ] The human release owner records the gate decision, seed/data version and sandbox context in this cycle record.
- [ ] The installed preview artifact and any OTA update match the mobile candidate and recorded API origin.
- [ ] Required mobile smoke checks are ready to run; record their results below after installation.

## Required smoke checks

Record a result and evidence for each behavior. Record stock before and after every successful sale.

Before sale checks, verify individual admin/cashier login, secure token restoration on restart, failed login, logout, and expired/revoked-token redirect to login. Confirm cashier inventory is read-only (no add/edit controls), admin product writes are available, and both roles can read all sales. Verify that admins can manage cashier accounts from the phone's Users screen; see [API-CONTRACT.md](API-CONTRACT.md#authentication-and-roles) for access rules and supported operations. Record account role labels, never passwords or tokens.

1. Search a product, add it to the cart, and complete a cash checkout.
2. Scan a barcode, add it to the cart, and complete a cash checkout.
3. Reject insufficient stock without creating a sale or negative stock.
4. Reject insufficient cash without creating a sale or changing stock.
5. Complete a successful QR Ph sandbox payment.
6. Verify failed/non-payable QR outcomes without a sale or stock deduction. Leave/reopen a pending attempt, simulate verification uncertainty, and confirm that pending/unknown or reservation expiry alone never unlocks Cash or another QR attempt. Verify restart recovery through Laravel. For `paid_unfulfilled` or contradictory outcomes, retain the recovery handle and tender lock; require operator reconciliation without a new payment.
7. Show a successful sale in transaction history.
8. Retry the same payment or idempotency key and verify one sale and one inventory deduction.

The Appium Android procedure is in [automation/appium/README.md](../automation/appium/README.md). A camera/barcode fixture must be available for the barcode check.

## Evidence

Attach or link concise evidence for:

- Mobile CI and `npm run verify`.
- API CI and `composer verify`.
- Postman/Newman output and the exact collection/API revision.
- Appium screenshots, video, logs, and result report.
- API deployment run, timestamped external health matching the deployed SHA, migration, seed, checkout, payment, and signed webhook results. See [Test Plan 2.1 evidence requirements](DEPLOYMENT.md#qa-evidence-test-plan-21); historical/local checks are not live deployment or payment proof.
- Defect issues, fixes, and human retest results.

Keep large raw artifacts in the agreed evidence store rather than source control. Redact tokens, secrets, and authorization headers.

## Defects

Create one GitHub Issue per defect using this information:

```text
Cycle: <cycle ID>
Environment / staging URL: <name and stable URL, no secrets>
Severity: Critical | High | Medium | Low
Requirement: <smoke behavior, contract rule, or specification requirement>
Steps to reproduce:
1. <exact step>
2. <exact step>
Expected: <what should happen>
Actual: <what happened>
Evidence: <screenshot, video, log, API response, or report link>
Fix commit / PR: <exact commit and full PR URL, or pending>
Retest: <human tester, date, exact paired SHAs, result, and evidence link>
```

Critical and High defects block approval. Medium defects require explicit human acceptance and follow-up work. Low defects may remain only when they do not compromise safety, the core cashier flow, or evidence integrity.

## Human approval and paired promotion

The designated human QA owner records the final decision only after:

- [ ] The exact paired revisions were tested.
- [ ] All required evidence is retained.
- [ ] No Critical or High defect remains open.
- [ ] Any accepted Medium defect has written human justification and follow-up work.
- [ ] The cycle record names the final result and approval date.

Only after human approval may the release owner promote the compatible mobile and API `staging` revisions to their matching `main` branches together. Neither repository may be promoted alone.
