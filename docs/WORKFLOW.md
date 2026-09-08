# Development, staging, and SQA workflow

This is the mobile half of the PorSca release unit. The Expo app is the only user-facing frontend. Laravel (`niks0501/PorSca_POS_API`) is the sole backend for local development, staging, and release.

## Branching

- `main` is stable and protected.
- `staging` is the permanent integration branch. It is created from `main` if absent and must be protected with required CI checks.
- Work happens on `feature/*` (or an automation worker branch such as `fm/*`) and reaches `staging` only through a pull request.
- A defect found in staging is fixed on a new branch from `staging`, then returned through a pull request. Do not patch `staging` directly.
- Mobile and API changes are promoted as a pair to `main` only after the formal QA cycle has human approval. Neither track should promote alone.

Keep permanent tester staging checkouts separate from worker worktrees. For example, keep a dedicated `/worktrees/porsca-mobile-staging` checkout on `staging` and a separate disposable checkout for each worker branch. Never run a worker in the tester checkout; this prevents worker resets, builds, or generated files from disturbing evidence collection.

A release owner should create the remote `staging` branch from `main` when bootstrapping a repository, then apply branch protection. This worker branch includes the local branch and the executable procedure but does not push a new remote branch or modify `main`.

## Canonical developer gate

Run this before requesting review and in CI:

```bash
npm run verify
```

It runs, in order, Expo lint, TypeScript typechecking, and the fast Jest/RNTL suite. A PR is not ready when any part is red. The API track owns its own API CI gate; the cycle record must include both exact commit SHAs and both CI links.

## Merging while the check runners are down (billing lock)

Checks that never started are not the same as checks that failed. Code the runners actually failed must never be merged without a fix.

Merging into `staging` while runners are down is allowed when all three hold:

1. The PR body shows a green local run of the canonical check command: `npm run verify`.
2. A human has reviewed the diff.
3. The billing lock is confirmed as the only reason the checks sat out.

Promoting anything into `main` still waits for green checks or the completed human QA round with approval.

Quotas reset every month, so this rule is a temporary bridge, not a permanent lowering of the bar. Narrowing check triggers to save minutes is a separate later decision, not part of this change.

## Environment profiles

Profiles are in [`eas.json`](../eas.json):

- `development`: internal development build pointed at a developer LAN API example. Replace the LAN address for the current network. A physical phone must never use `localhost`.
- `preview`: internal staging build pointed at the stable staging API origin. This is the formal SQA candidate.
- `production`: reserved for a separately approved production configuration; production hosting and PayMongo are out of scope for this round.

Profiles are configuration only. No EAS build or deploy runs automatically. Keep the preview build manual because the Expo build quota is limited.

## Preview/staging build gate

Run the following gate and record the evidence before any `eas build --profile preview` command:

1. Mobile CI is green for the exact candidate commit, including `npm run verify`.
2. API CI is green for the paired Laravel commit.
3. The stable staging API answers `/health` and its required resource/payment routes.
4. Laravel migrations have run and staging data has been seeded with the recorded data/seed version.
5. PayMongo sandbox credentials are configured server-side, sandbox callbacks/webhooks are reachable, and webhook verification is enabled.
6. API-track backend automation checks (Postman/Newman) are green.
7. The required mobile smoke flows are green on the Android/Appium staging seam: search→cash checkout, barcode scan→cash checkout, insufficient-stock rejection, insufficient-cash rejection, QR Ph sandbox success, QR Ph failure/cancel with no sale, history shows success, and exactly-once inventory deduction across retry/duplicate conditions.
8. The cycle owner records the gate decision, candidate SHAs, environment URLs (without secrets), seed/data version, and sandbox context.

Only after all eight checks are green may the release owner manually build the preview candidate:

```bash
eas build --profile preview --platform android
```

A failed gate blocks the build; do not spend an EAS build to discover a staging/configuration failure.

## Formal QA cycle record

Keep one shared record per cycle (issue, release note, or approved QA artifact) with:

- cycle ID and owner;
- exact mobile commit SHA and exact Laravel API commit SHA;
- `porsca-mobile-api-v1` contract version;
- environment/profile and staging API origin;
- migration and seed/data version;
- PayMongo sandbox account/context, webhook endpoint reachability, and provider test mode;
- mobile CI, API CI, Jest/RNTL, Appium, and Postman/Newman evidence links;
- smoke-flow results, open defects, and human approval decision/time.

### Defect truth and severity

GitHub Issues are the source of truth. Every defect issue must include `cycle`, `environment`, `severity`, `requirement`, `steps to reproduce`, `expected`, `actual`, `fix commit/PR`, and `retest evidence` fields. Attach concise evidence links; keep large raw logs outside the source repository in the agreed cycle artifact store.

Severity is `Critical`, `High`, `Medium`, or `Low`. Critical and High defects block approval. Medium defects may be accepted only with an explicit cycle-owner rationale and follow-up issue; Low defects are allowed when they do not compromise safety, core cashier flow, or evidence integrity. A retest closes the defect only when the exact candidate is named.

The Defect Summary is derived from GitHub Issues for the cycle/environment: counts by severity and state, blocking count, accepted Medium list, allowed Low list, and links to each issue. Do not maintain a second manually edited defect truth table.

Retain Appium screenshots/video/logs, Postman/Newman reports, Jest/RNTL output, Laravel CI/migration/seed/webhook artifacts, and the cycle record for the agreed project retention period. Large raw logs remain in artifact storage, not committed source.

Final QA approval remains human. Automation supplies evidence and blocking signals; it does not merge, promote, or declare release approval. Funnel wiring, EAS execution, and any production action remain manual.

## Out of scope this round

There is no web frontend, production PayMongo or hosting work, automatic deployment/build, offline sync, voice/OCR/catalog lookup, tingi hierarchy, mandatory Agent Device gate, or multi-store role system in this mobile delivery.
