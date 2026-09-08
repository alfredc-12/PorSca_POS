# PorSca QA cycle 1

This is the shared record for the first formal QA cycle. It is a guide for the human tester and release owner. This record does not say that QA passed.

## Cycle details

- **Cycle ID:** `porsca-qa-cycle-01`
- **Spec:** [PorSca issue 1](https://github.com/alfredc-12/PorSca_POS/issues/1)
- **QA owner:** Designated human tester (fill in before the run)
- **Environment:** Staging
- **Staging API address:** The release owner must supply the stable address before testing. Do not use a local address or the example address in `eas.json`.
- **App profile:** `preview`, after the preview gate is green
- **API contract:** `porsca-mobile-api-v1`
- **Cycle status:** Not started. Human approval is pending.

## Pinned code

Use these exact commits. Do not test a different commit without starting a new cycle record.

| Side | Branch | Full commit SHA | Commit link |
| --- | --- | --- | --- |
| Mobile | `staging` | `fb6edf395456f3803c75f2dbcfbcda1afa563bf1` | [mobile commit](https://github.com/alfredc-12/PorSca_POS/commit/fb6edf395456f3803c75f2dbcfbcda1afa563bf1) |
| API | `staging` | `13d294b3650d50d0ad703321d75f0372bb40df20` | [API commit](https://github.com/niks0501/PorSca_POS_API/commit/13d294b3650d50d0ad703321d75f0372bb40df20) |

The mobile staging branch was missing. It was created at the live mobile `main` tip above. The API staging branch already pointed to the API commit above.

Before the human run, the release owner must confirm that the two branch tips still match these full SHAs:

```bash
npx -y gh-axi api /repos/alfredc-12/PorSca_POS/branches/staging --jq '.commit.sha'
npx -y gh-axi api /repos/niks0501/PorSca_POS_API/branches/staging --jq '.commit.sha'
```

Success looks like the mobile command prints `fb6edf395456f3803c75f2dbcfbcda1afa563bf1` and the API command prints `13d294b3650d50d0ad703321d75f0372bb40df20`.

## Seed and data baseline

- **Mobile baseline:** `mobile-fallback-seed@fb6edf395456f3803c75f2dbcfbcda1afa563bf1`. This is the `seedProducts` data in [`src/data/mockProducts.ts`](https://github.com/alfredc-12/PorSca_POS/blob/fb6edf395456f3803c75f2dbcfbcda1afa563bf1/src/data/mockProducts.ts). The mobile repository has no separate seed tag.
- **API baseline:** `qa-baseline-2026-01`. Run the API reset command once before the cycle and record its printed version. The API seed code is [`DatabaseSeeder.php`](https://github.com/niks0501/PorSca_POS_API/blob/13d294b3650d50d0ad703321d75f0372bb40df20/database/seeders/DatabaseSeeder.php).
- **API migrations:** The migration set at API SHA `13d294b3650d50d0ad703321d75f0372bb40df20`.
- **Data rule:** Do not reset, reseed, or patch the staging data during the cycle. If a test needs a fresh fixture, the release owner must plan that before the run.

The release owner prepares the API baseline. Run this in the API checkout, not in this mobile checkout:

```bash
php artisan qa:reset --force
```

Success looks like the API reports `qa-baseline-2026-01` and the staging data is ready. If the command is not available, stop the setup and ask the API owner. Do not invent a new baseline in this record.

## Payment context

Sandbox keys are not in this repository and are not supplied in this record. This does not block setup. The app has a clearly labeled practice mode for setup and local checks.

For formal staging QA, the human tester and release owner must still agree on the payment context:

1. Put PayMongo sandbox keys and webhook verification material in the API server environment only.
2. Never put a secret in an `EXPO_PUBLIC_*` value or in this record.
3. Confirm the webhook endpoint can be reached.
4. Record the sandbox account label or vault reference, not the key value.
5. If keys are still absent, mark the QR result as **practice-labeled** and leave formal payment approval pending. Setup itself remains unblocked.

## Before the human run

Complete these steps in order. Do not start the preview build until the gate is green.

### 1. Check the code pins

Use the two `gh-axi` commands in [Pinned code](#pinned-code).

**Success:** both printed SHAs match this record exactly.

### 2. Prepare the staging API

Use the API owner's staging checkout. Set the stable staging address in the tester build configuration. Keep secrets on the API server.

**Success:** `GET <staging-address>/health` returns a healthy staging response, and the products, inventory, sales, transactions, payment, and webhook routes respond as expected.

### 3. Load the data baseline

Run the `php artisan qa:reset --force` command in [Seed and data baseline](#seed-and-data-baseline) once.

**Success:** the API reports `qa-baseline-2026-01`. The tester records the output with the cycle evidence.

### 4. Build or install the candidate

Only after the mobile CI, API CI, data, payment, and automation gates below are green, the release owner may run:

```bash
eas build --profile preview --platform android
```

**Success:** the human tester has a preview build that points to the stable staging API address and can open the seeded POS screen. A red gate blocks this step.

## Eight required smoke checks

Reset to the recorded baseline before the cycle. Follow the same order for every run. Capture a screenshot or short log for each result. Record the product stock before and after every successful sale.

| # | Required behavior | Human steps | Success looks like |
| --- | --- | --- | --- |
| 1 | Search to cash | Search for `Coca-Cola`. Add it. Choose **Cash**. Enter `100`. Confirm. | A payment and sale are recorded. The receipt is shown. Stock drops by one. |
| 2 | Scan to cash | Open the scanner. Allow camera access. Present barcode `4800010000011`. Choose **Cash**. Enter `100`. Confirm. | The product is added from the scan. A payment and sale are recorded. Stock drops by one. |
| 3 | Insufficient-stock rejection | Search for `Piattos`. Try to add more than its baseline stock of `8`. | The extra item is refused with an out-of-stock message. No sale is made for the refused item. Stock does not go below zero. |
| 4 | Insufficient-cash rejection | Add `Coca-Cola`. Choose **Cash**. Enter `1`. Confirm. | The app shows **Insufficient cash**. No sale is recorded. Stock does not change. |
| 5 | QR success | Add a product. Choose **QR Ph**. Start payment. Use the approved sandbox success result, or the practice-labeled success result when keys are absent. | The payment is paid. One sale is recorded. The receipt and history show success. Stock drops by the cart quantity. |
| 6 | QR fail or cancel with no sale | Add a product. Choose **QR Ph**. Start payment. Choose the approved failed or cancelled result. | The payment is failed or cancelled. No sale is recorded. The cart and stock do not change. |
| 7 | History shows success | Open **Transactions** after check 1 or check 5. Find the completed sale. | History shows the successful payment, amount, item, and completed status. |
| 8 | Inventory deducted exactly once | Record stock before a sale. Repeat the same payment request or retry with the same idempotency key. Check the sale and stock in the API and app. | There is one sale. Stock falls by the cart quantity once, not twice. The retry returns the original result. |

The exact API safety rules are in [`docs/API-CONTRACT.md`](https://github.com/alfredc-12/PorSca_POS/blob/fb6edf395456f3803c75f2dbcfbcda1afa563bf1/docs/API-CONTRACT.md). Failed, cancelled, expired, and pending payments must not create a sale or change stock.

## Evidence checklist

Mark each item only after its result and link are saved with this cycle record. The commands below are instructions for the human or release owner; this worker did not run QA.

| Evidence | Command or action | Success looks like | Evidence link or file |
| --- | --- | --- | --- |
| Native automation | From the mobile checkout: `cd automation/appium && npm install && APPIUM_RUN=true APPIUM_DEVICE_NAME="<device>" APPIUM_APP_PACKAGE=com.porsca.pos npm run smoke` | All eight required smoke behaviors pass on a fresh preview install. The barcode fixture is available. | Add Appium report, screenshots, video, and logs. Keep large files in the cycle artifact store. See the [Appium guide](https://github.com/alfredc-12/PorSca_POS/blob/fb6edf395456f3803c75f2dbcfbcda1afa563bf1/automation/appium/README.md). |
| API automation | Run the API Postman/Newman collection from [`PorSca-API.postman_collection.json`](https://github.com/niks0501/PorSca_POS_API/blob/13d294b3650d50d0ad703321d75f0372bb40df20/postman/PorSca-API.postman_collection.json) against the stable staging address. | The collection completes with all requests and assertions passing. | Add the Newman report and exact collection/API revision. |
| Fast suites | From the mobile checkout: `npm ci && npm run verify` | Lint, TypeScript checks, and the Jest/React Native Testing Library tests all pass. | Add the CI link and command output. The [mobile CI run](https://github.com/alfredc-12/PorSca_POS/actions/runs/34228978707) for the pinned commit is currently red because of the account billing lock. It is not evidence of a code defect. |
| Backend suite | From the API checkout: `composer verify` | Laravel tests, Pint, and the API checks pass. | Add the API CI link and output. The [API CI run](https://github.com/niks0501/PorSca_POS_API/actions/runs/34224573891) for the pinned API commit passed. |

The mobile workflow is [`mobile-ci.yml`](https://github.com/alfredc-12/PorSca_POS/blob/fb6edf395456f3803c75f2dbcfbcda1afa563bf1/.github/workflows/mobile-ci.yml). The API workflow is [`api.yml`](https://github.com/niks0501/PorSca_POS_API/blob/13d294b3650d50d0ad703321d75f0372bb40df20/.github/workflows/api.yml).

Do not try to fix the billing lock as part of QA. A repository owner must handle that separately. Do not spend an EAS build while the mobile gate is red.

## Defect capture template

GitHub Issues are the source of truth. Use one issue for each defect. Keep the cycle ID and environment in the issue title and body.

```text
Cycle: porsca-qa-cycle-01
Environment / staging URL: <name and stable URL, no secrets>
Severity: Critical | High | Medium | Low
Requirement: <smoke behavior, contract rule, or issue requirement>
Steps to reproduce:
1. <exact step>
2. <exact step>
3. <exact step>
Expected: <what should happen>
Actual: <what happened>
Evidence: <screenshot, video, log, API response, or report link>
Fix commit / PR: <exact commit and full PR URL, or pending>
Retest: <human tester, date, exact paired SHAs, result, and evidence link>
```

Severity rules:

- **Critical:** Data loss, duplicate charge or sale or deduction, secret exposure, or a blocked core checkout. This blocks approval.
- **High:** A required core behavior is wrong or a major mobile/API flow cannot finish. This blocks approval.
- **Medium:** A non-core defect with a safe workaround. It does not block by itself, but the cycle owner must record why it is accepted and open follow-up work.
- **Low:** Copy, layout, or small polish issue. It does not block when it does not affect safety, the core cashier flow, or evidence integrity.

Do not close a defect until a human records a retest against the exact candidate pair. If a fix changes either pinned SHA, record the new pair and decide whether a new cycle is needed. Derive the cycle defect summary from the GitHub issue query. Do not keep a second manual defect truth table.

## Human approval and paired promotion

The designated human, not this worker, must make the approval decision.

- [ ] The stable staging API address is supplied and checked.
- [ ] The human tester has a phone or approved device and the preview candidate.
- [ ] The payment context is recorded. Secrets are not in this repository.
- [ ] The API data baseline is recorded as `qa-baseline-2026-01`.
- [ ] The mobile and API SHAs still match the pins in this record.
- [ ] Mobile CI is green, or the repository owner has separately resolved the billing lock and rerun it.
- [ ] API CI and the backend suite are green.
- [ ] Native automation and API automation evidence are saved.
- [ ] The fast suites are green.
- [ ] All eight smoke checks are complete.
- [ ] No Critical or High defect remains open.
- [ ] Every accepted Medium has a written cycle-owner reason and follow-up issue.
- [ ] A designated human records approval, date, exact paired SHAs, and evidence links.
- [ ] Only after approval, the release owner promotes **both** `staging` branches to their matching `main` branches as one pair.

Neither repository may be promoted alone. This worker will not run QA, build the preview, merge, promote to `main`, or change billing.

## Out of scope

- Running QA. A human needs the phone, sandbox context, and stable staging address.
- Promoting either repository to `main`.
- Touching the GitHub billing lock.
- Rebuilding the preview build before the gate is green.
- Adding staging or tester instructions to the root README. The root README remains local-setup-only.
