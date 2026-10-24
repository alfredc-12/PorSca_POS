# PROJECT_CHECKS.md

Per-repo tier command mapping for adaptive no-mistakes validation
(Phase 2; this file is the single source of truth for the T0-T3 tier
command table and standing restrictions. `.no-mistakes.yaml` `test:`
block points here for tier routing and defines critical-path
test authority).

## Frozen checkout golden matrix

The frozen matrix for `checkoutMachine`, `durableCheckout`,
`checkoutGuidance`, and `moneyBounds`, including coverage, test-file mapping,
and frozen commit SHAs, is recorded in [merged PR 107](https://github.com/alfredc-12/PorSca_POS/pull/107).
Its authority and no-edit rules live in `.no-mistakes.yaml` under
`test.instructions`.

## Tier commands (PorSca_POS)

| Tier | Scope | Commands |
|------|-------|----------|
| T0 | Docs/markdown only, no product code | Review-only: check consistency with the authoritative doc owners in `.no-mistakes.yaml` (`document:`). No automated doc-check command exists in this repo; do not invent tooling. |
| T1 | Small scoped code change (single target) | `npm run lint` + `npm run typecheck` + `npm run test:fast -- <target>` |
| T2 | Default feature change | `npm run verify` (lint + typecheck + fast Jest/RNTL suite; the Mobile CI gate command) |
| T3 | Checkout/payment, stock/transaction, or API-contract change | `npm run verify` plus the `src/domain` and `src/api` suites: `npm run test:fast -- src/domain src/api` |

Each higher tier subsumes the lower ones.

## Standing restrictions

- Browser-compatible live verification only, via Expo Web through
  chrome-devtools-axi (unique `CHROME_DEVTOOLS_AXI_SESSION` per run,
  default isolated Chrome launch mode, worktree-owned app port).
- Never use agent-device, phones, emulators, ADB, native builds, or
  device E2E. Do not create persistent E2E scripts.
- Never trigger real payments or deployments.
- Browser success does not establish native correctness. Report actual
  defects as no-go; report unsupported or unavailable verification as
  inconclusive with reasons and manual testing steps. Never mark
  unverified behavior as passed.
- Clean up only resources owned by the run.
