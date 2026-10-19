# Approved staging deployment and documentation reconciliation

## Architecture: section 6.2

For the project report's **section 6.2**, describe the implemented two-repository system, not a separate payment service:

```text
Expo / React Native phone app (alfredc-12/PorSca_POS)
  -> HTTPS Laravel /api/v1 (niks0501/PorSca_POS_API)
       -> API-owned database (catalog, checkout, sales, inventory)
       -> PayMongo sandbox (QR Ph creation and verification)
PayMongo signed webhook -> Laravel /api/v1/webhooks/paymongo
```

PayMongo is an external provider integrated inside Laravel, not a third PorSca repository or a mobile SDK authority. The retired embedded Express scaffold is not deployed. Mobile uses `src/api/client.ts`; Laravel owns provider credentials, webhook verification, durable checkout, idempotency, sale persistence and stock deduction. See [ARCHITECTURE.md](ARCHITECTURE.md) and [API-CONTRACT.md](API-CONTRACT.md) for the v3 lifecycle, including unresolved and paid-but-unfulfilled payments.

The section numbers here are traceability targets supplied for the project report, not headings from a report checked into this repository. Update the external report/diagrams to this implementation; do not rebuild the system to match an obsolete diagram.

## Staging and deployment: section 7

The approved permanent staging target is **AWS Lightsail**, serving Laravel over HTTPS at `https://staging-api.lumbangan.online/api/v1`. The preview profile in [`eas.json`](../eas.json) bundles that origin; a configured hostname is not deployment evidence by itself, so pair it with the external health evidence below. The mobile preview artifact is distributed through EAS; EAS does not host Laravel or the database.

The API track owns the [Lightsail staging runbook](https://github.com/niks0501/PorSca_POS_API/blob/development/docs/STAGING.md) and its [manual deployment workflow](https://github.com/niks0501/PorSca_POS_API/blob/development/.github/workflows/deploy-staging.yml). At candidate selection, read those files at the exact API SHA rather than assuming the development branch is what is deployed.

The approved runbook specifies an Ubuntu Lightsail host with Nginx/TLS, PHP-FPM, Composer and an isolated MySQL staging database. Database, admin and PayMongo secrets stay in the private host environment. The deployment workflow uses only SSH connection secrets and is manually dispatched for the `staging` ref; pushes do not automatically deploy. It installs dependencies, migrates, records `APP_COMMIT`, caches configuration and verifies HTTPS health against the dispatched full SHA. Deployment does **not** reset or seed QA data and a failed deployment is not an automatic rollback. Operator-owned backup, rollback and restore procedures remain in the API runbook; do not use a QA reset to recover financial data.

Tailscale Funnel is **break-glass only**, not the permanent staging architecture or a prerequisite for normal Lightsail availability. Any approved temporary origin must be recorded explicitly; the installed preview app cannot silently switch origins. Changing the bundled API URL requires a rebuilt preview candidate and an updated cycle record.

This documentation records the approved target, not a claim that provisioning, DNS/TLS, deployment or live sandbox payment has succeeded. No infrastructure is changed by this reconciliation.

## QA evidence: Test Plan 2.1

For **Test Plan 2.1**, test the installed mobile app against the paired Laravel revision on the recorded Lightsail origin, not against a separate PayMongo repository or an assumed developer-hosted tunnel. Use [WORKFLOW.md](WORKFLOW.md#previewstaging-build-gate) for the pre-build gate and [QA-CYCLE-TEMPLATE.md](QA-CYCLE-TEMPLATE.md) for the later human-created formal cycle.

Retain evidence that distinguishes configuration from execution:

| Claim | Required evidence |
| --- | --- |
| Candidate deployed | Exact mobile/API SHAs, API manual workflow run and dispatched SHA, timestamped external HTTPS health response with matching `data.commit`, `environment=staging`, `database=ok`, `paymongo_mode=sandbox`, `status=ok` |
| Correct phone artifact | EAS build ID/link, preview profile, bundled API origin, native runtime/build and any applied OTA update ID |
| Reproducible data | Migration set and synthetic seed/baseline version; human-authorized initial reset, then preservation through the cycle |
| Fast checks | Mobile `npm run verify` and API `composer verify` results tied to exact SHAs |
| External API behavior | Postman/Newman report, collection revision, target origin and API SHA |
| Native cashier flow | Android/Appium results and screenshots/logs for the cycle's required smoke checks |
| Real sandbox payment | Laravel provider verification/signed webhook evidence, matching checkout/attempt and sale, history and stock before/after, including duplicate/retry behavior; redact secrets |
| Release decision | Linked defects and retests, human QA approval, paired promotion decision |

Practice/synthetic pending QR results, local tests and historical parity artifacts are not proof of live sandbox payment or a newly deployed candidate. Record unavailable checks as pending, not passed. Pending/unknown QR cannot unlock another tender; reservation expiry alone does not establish non-payability. Exercise `paid_unfulfilled` and contradictory outcomes without creating a replacement payment. Only a completed Laravel checkout with a committed sale counts as sale success.

The gap issue linked from [ARCHITECTURE.md](ARCHITECTURE.md#documentation-traceability) tracks teammate updates to the external report sections and test plan. It is documentation work, not a formal QA cycle or release approval.
