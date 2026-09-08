# PorSca mobile agent map

## What this repo is

- PorSca POS is a phone app for a small shop.
- A cashier can search or scan products, build a cart, and take cash or QR Ph payments.
- The app records sales and keeps stock accurate after payment succeeds.
- The Expo/React Native app is the user-facing client; Laravel is the staging and release backend.
- QR Ph is practice-labeled in the app, and provider secrets stay on the server.

## Start here

- Canonical check: `npm run verify`.
- Setup and local running: [docs/SETUP.md](docs/SETUP.md).

## Documentation map

- Setup: [docs/SETUP.md](docs/SETUP.md).
- Structure and boundaries: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Workflow, including the billing-outage merge rule: [docs/WORKFLOW.md](docs/WORKFLOW.md).
- Mobile/API contract: [docs/API-CONTRACT.md](docs/API-CONTRACT.md).
- QA cycle and evidence: [docs/QA-CYCLE-01.md](docs/QA-CYCLE-01.md).
- Product taste and cashier flow: [DESIGN.md](DESIGN.md) and [PRODUCT.md](PRODUCT.md).

## Mobile/API handshake

- The live contract name is `porsca-mobile-api-v1`; verify it in [docs/API-CONTRACT.md](docs/API-CONTRACT.md).
- To check the pair, compare the exact mobile and API `staging` revisions with the pair recorded in [docs/QA-CYCLE-01.md](docs/QA-CYCLE-01.md).
- Promote matching mobile and API revisions together only after human QA approval; never promote one side alone.

## Boundaries

- Never merge or approve a QA round.
- Keep secrets server-side; never put them in the mobile bundle or public client settings.
- Treat `staging` as the workbench and `main` as the shop window.
- Payments without provider keys must remain clearly practice-labeled.

## Keeping this map fresh

When a PR changes setup, the contract, or the workflow, update this file in the same PR. Keep it short and point to the owning document instead of copying its detail.

Keep this file useful to every agent session. Do not add supervisor-specific mechanics, machine paths, private nicknames, or harness-specific instructions.
