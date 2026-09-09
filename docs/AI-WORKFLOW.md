# AI-assisted development workflow

This document defines the project rules for AI-assisted contributions to the Expo mobile application.
It complements `AGENTS.md`, `docs/WORKFLOW.md`, `docs/API-CONTRACT.md`, and `docs/ARCHITECTURE.md`.
It does not create or start a formal QA cycle.

## Before coding

1. Read `AGENTS.md` and the documents named by the task.
2. Identify the GitHub issue and state the user-visible behavior being changed.
3. Inspect the existing implementation, tests, API contract, and related history before proposing new code.
4. Classify the change as mobile-only, API-only, or cross-repository.
5. Record assumptions and unresolved questions instead of inventing routes, response shapes, or payment behavior.
6. Work on a feature or fix branch and never commit directly to `main` or `staging`.

## Source of truth

- Mobile behavior and visual intent live in `PRODUCT.md`, `DESIGN.md`, and the current application code.
- Network paths, fields, errors, and contract version live in `docs/API-CONTRACT.md` and the API repository's architecture documentation.
- Laravel is the only staging and release backend.
- `server/` is a deprecated local scaffold and is not a release integration target.
- `npm run verify` is the canonical mobile check.
- Formal QA procedures live in `docs/WORKFLOW.md` and `docs/QA-CYCLE-TEMPLATE.md`.

## Cross-repository changes

Treat mobile and API changes as one release-unit change when they alter a route, request, response, error, authentication rule, payment state, or idempotency behavior.

A cross-repository change must:

- Update the affected contract documentation in both repositories.
- Keep the contract version synchronized or explain the intentional version change.
- Add or update behavior-focused tests on both sides.
- Use paired pull requests that name each other.
- State compatibility, migration, and rollout order in both pull requests.
- Verify the real Laravel route and response rather than relying on a mock-only client test.

Do not add direct network calls to screens or contexts; use the client boundary in `src/api/client.ts`.
Do not treat the local Express scaffold as evidence of Laravel compatibility.

## Security and data

Never place API tokens, PayMongo keys, webhook secrets, or authorization headers in source, Expo public variables, fixtures, screenshots, logs, or pull requests.
Keep payment-provider requests and webhook verification on Laravel.
Use synthetic data for local and staging work.
Do not weaken authentication, payment confirmation, idempotency, or inventory transaction rules to make a test pass.

## Verification

Before requesting review, run:

```sh
npm run verify
```

For changes that affect the installed app, also describe the device or emulator check performed.
For API-facing changes, include the API revision, endpoint evidence, and the paired API verification result when available.
Do not claim formal QA from `npm run verify`, mocked tests, or a local emulator run.

## Pull request evidence

Every AI-assisted pull request must explain:

- The issue and user-visible intent.
- The files and behavior changed.
- Whether the API contract or the other repository is affected.
- Tests and commands run, including failures and external blockers.
- Security, migration, seed-data, and rollback considerations.
- Any remaining assumptions or follow-up work.

A pull request may prepare QA instructions or evidence templates, but it must not create a cycle record during ordinary implementation.
Only the designated human release owner creates a formal cycle after selecting a paired staging candidate.

## Human decisions

AI agents may implement, test, document, and report findings.
They must not approve a formal QA cycle, merge a release, promote a revision to `main`, or decide to weaken a safety or payment requirement.
When evidence is ambiguous, stop at the documented decision and ask the human owner.
