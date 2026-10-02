# Project Context

## Purpose

PorSca POS is the Expo mobile client for a small shop. Cashiers search or scan products, build a cart, and complete cash or QR Ph checkout; the app displays inventory and sales history.

## Stack

- Application: Expo SDK 57, React Native, and Expo Router.
- Language/runtime: TypeScript, Node.js, and npm.
- Backend: Laravel API in the separate `PorSca_POS_API` repository; it is the only backend authority.
- Database: owned by the API; this mobile repository has no database connection or migrations.
- Payment provider: PayMongo is accessed only by Laravel.
- Deployment: Expo/EAS profiles are defined in `eas.json`; follow the release gates in `docs/WORKFLOW.md`.

## Architecture

- `app/` contains Expo Router screens and route layouts.
- `src/api/client.ts` is the sole mobile network boundary; `src/auth/`, `src/context/`, `src/domain/`, `src/hooks/`, and `src/components/` own session, POS state, business rules, and shared UI.
- Laravel owns authentication authorization, pricing, payment settlement, sale persistence, idempotency, and final inventory deductions.
- See `docs/ARCHITECTURE.md` and `docs/API-CONTRACT.md` for the maintained architecture and wire contract.

## Important conventions and security

- Follow the repository map in `AGENTS.md` and the cashier/payment boundaries in `docs/WORKFLOW.md` and `docs/API-CONTRACT.md`.
- Route all API traffic through `src/api/client.ts`; do not put credentials, access tokens, or payment-provider secrets in Expo public configuration or the app bundle.
- QR Ph completion and inventory updates require Laravel-confirmed payment. The opt-in demo catalog never records a local sale.
- The mobile/API contract is `porsca-mobile-api-v2`; coordinate compatible mobile and API releases.

## Verification

Use `npm run verify` for lint, TypeScript, and fast Jest/React Native Testing Library checks. Exact commands and optional device checks are listed in `PROJECT_CHECKS.md` and `docs/SETUP.md`.

## Constraints and priorities

- Keep this client focused on the mobile experience; backend changes, database work, and provider credentials belong to the API repository.
- Follow `PRODUCT.md`, `DESIGN.md`, the current issue, and `docs/WORKFLOW.md` for active product priorities and release decisions rather than treating this file as a roadmap.
- Android device/E2E verification is gated by explicit intent and the managed emulator/ADB requirements in `PROJECT_STACK.md`.

## Known limitations

- The seeded demo catalog is opt-in and can substitute catalog reads only; it cannot complete a sale. See `docs/SETUP.md#offline-demo-catalog`.
