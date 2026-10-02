# Project Verification Commands

## Fast checks

- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Focused Jest test: `npm run test:fast -- <test-path-or-Jest-options>`
- Canonical fast gate: `npm run verify` (lint, typecheck, then the fast Jest/React Native Testing Library suite).

## Broader checks

- Test suite: `npm run test:fast`
- Build: no build script is defined in `package.json`; EAS builds are governed by `docs/WORKFLOW.md` and are not routine verification.
- Integration/API contract: backend contract automation belongs to the Laravel API repository; see `docs/API-CONTRACT.md`.
- Focused Agent Device flow: `npm run e2e:flow -- .agent-device/flows/<flow>.ad`
- Full Agent Device suite: `npm run e2e`
- Agent Device diagnostics: `npm run e2e:doctor`

Device/E2E checks are exceptional and require explicit intent. Follow `PROJECT_STACK.md` and `docs/WORKFLOW.md`; do not start an emulator or run device/E2E checks as part of ordinary fast verification.

## Manual verification

Use the native app and managed device only when the task or acceptance criteria require UI/native evidence. For formal mobile/API QA, follow the staging and cycle-record process in `docs/WORKFLOW.md`.

## Database checks

- Schema validation/migrations: not applicable in this mobile repository; the Laravel API owns the database.
- Database tests: run in the API repository under its own safety and QA workflow.
