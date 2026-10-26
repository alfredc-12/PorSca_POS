# PROJECT_CHECKS.md

Per-repo tier command mapping for adaptive no-mistakes validation
(Phase 2; this file is the single source of truth for the T0-T3 tier
command table, standing restrictions, and critical-path/frozen-suite
safeguards. `.no-mistakes.yaml` `test:` block points here for tier
routing and these safety/proof rules).

## Critical-path proof authority

For checkout/payment, stock/transaction, or API-contract behavior: only tests
already blessed by secondmate or owned by a human count as proof.
Worker-written tests are supplemental proposals, not proof, until secondmate or
a human blesses them.

Practice payment payloads must remain non-payable; never simulate their
payment as paid or infer a paid state from client/test-only data.

## Frozen checkout golden matrix

The frozen matrix for `checkoutMachine`, `durableCheckout`,
`checkoutGuidance`, and `moneyBounds`, including coverage, test-file mapping,
and frozen commit SHAs, is recorded in [merged PR 107](https://github.com/alfredc-12/PorSca_POS/pull/107).
Do not edit, weaken, remove, rename, relocate, or duplicate these suites
or their assertions without explicit captain sign-off. If required work
would touch one, stop and escalate; do not work around it.
Their authority and no-edit rules are defined here; `.no-mistakes.yaml`
`test.instructions` points to this section.

## Blessed supplemental proof (test-blessing authority, 2026-10-24)

Admitted by crewmate worker `porsca-proof-adopt-20261024`; evidence in
`data/porsca-proof-adopt-20261024/report.md`. Scoped as stated there:
client-side orchestration and wire-shape pins only — never backend
deduction, which remains API-track proof.

| Suite | File | Mobile rev | sha256 | Tests |
| --- | --- | --- | --- | --- |
| `posOrchestration` | `src/context/PosContext.test.tsx` | `bf80023f8196e3af259e91b7885feaee4ece07f8` | `d9c7e644…9349a72b` | 68 |
| `authorityWire` | `src/api/checkoutAuthority.test.ts` | `bf80023f8196e3af259e91b7885feaee4ece07f8` | `51a98172…89b678776` | 5 |

Post-freeze additions to `durableCheckout.test.ts` (35 lines via
https://github.com/alfredc-12/PorSca_POS/pull/108 and
https://github.com/alfredc-12/PorSca_POS/pull/110) and
`checkoutGuidance.test.ts` (21+/3- via
https://github.com/alfredc-12/PorSca_POS/pull/108) are **supplemental**:
no captain sign-off located (zero reviews/comments on either PR).

## Tier commands (PorSca_POS)

| Tier | Scope | Commands |
|------|-------|----------|
| T0 | Docs/markdown only, no product code | Review-only: check consistency with the documentation map in `AGENTS.md`. No automated doc-check command exists in this repo; do not invent tooling. |
| T1 | Small scoped code change (single target) | `npm run lint` + `npm run typecheck` + `npm run test:fast -- <target>` |
| T2 | Default feature change | Fixed `commands.test` baseline plus targeted checks for changed behavior; broad `npm run verify` is required in CI. |
| T3 | Checkout/payment, stock/transaction, or API-contract change | Fixed `commands.test` baseline plus targeted, already-authoritative tests for affected invariants; broad `npm run verify` remains required in CI. |

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
