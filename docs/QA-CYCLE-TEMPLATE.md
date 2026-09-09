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
- **Staging API address:** `<stable HTTPS address ending in /api/v1>`
- **App profile:** `preview`, after the pre-build checklist is green
- **API contract:** `porsca-mobile-api-v1`
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

Complete these items before creating or installing a preview build:

- [ ] The exact mobile and API SHAs are recorded and still available on `staging`.
- [ ] The stable staging API address answers the health check and required routes.
- [ ] The isolated staging database has been reset and seeded with the recorded version.
- [ ] The database will remain unchanged during this cycle.
- [ ] Mobile CI is green for the exact mobile candidate.
- [ ] API CI and `composer verify` are green for the exact API candidate.
- [ ] Postman/Newman backend checks pass against the stable staging address.
- [ ] PayMongo sandbox configuration and webhook reachability are recorded.
- [ ] The required mobile smoke checks are ready to run.
- [ ] The human release owner records the checklist result.

Only the human release owner may authorize the manual preview build after this checklist is green.

```bash
eas build --profile preview --platform android
```

## Required smoke checks

Record a result and evidence for each behavior. Record stock before and after every successful sale.

1. Search a product, add it to the cart, and complete a cash checkout.
2. Scan a barcode, add it to the cart, and complete a cash checkout.
3. Reject insufficient stock without creating a sale or negative stock.
4. Reject insufficient cash without creating a sale or changing stock.
5. Complete a successful QR Ph sandbox payment.
6. Complete a failed or cancelled QR Ph payment without creating a sale or changing stock.
7. Show a successful sale in transaction history.
8. Retry the same payment or idempotency key and verify one sale and one inventory deduction.

The Appium Android procedure is in [automation/appium/README.md](../automation/appium/README.md). A camera/barcode fixture must be available for the barcode check.

## Evidence

Attach or link concise evidence for:

- Mobile CI and `npm run verify`.
- API CI and `composer verify`.
- Postman/Newman output and the exact collection/API revision.
- Appium screenshots, video, logs, and result report.
- API health, migration, seed, checkout, payment, and webhook results.
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
