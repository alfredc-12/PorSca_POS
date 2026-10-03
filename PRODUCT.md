# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

Expo SDK 57, React Native, TypeScript, Expo Router. Laravel is the sole backend for catalog, checkout, inventory, history, and PayMongo QR Ph integration.

## Users

Primary user: a cashier or small-store operator holding a phone and recording customer purchases at the point of sale.

## Product Purpose

PorSca POS is a lightweight mobile POS that lets a cashier scan products with the phone camera, build a cart, accept cash or QR Ph payment, record a completed sale, and keep stock counts accurate.

## Operating Context

The cashier uses one phone during normal in-person retail transactions. Product barcodes are scanned from packaging. The app should be fast enough for repeated checkout work and readable in ordinary indoor retail lighting.

## Capabilities and Constraints

- Scan product barcodes with the phone camera.
- Add scanned products to a cart and calculate totals.
- Prevent quantities beyond available stock.
- Sign in with an individual API-managed admin or cashier account; native sessions use secure token storage.
- Admins manage product name, barcode, price, and stock quantity; cashiers view inventory read-only.
- Admins manage cashier accounts from the phone Users screen: create accounts, review roles and active state, deactivate, and reactivate cashiers. Cashiers cannot access this screen; the API remains the authorization authority.
- Both roles can read all sales. Cashier permissions are fixed by role; there is no permission editor.
- Record cash received and calculate change.
- Support a PayMongo sandbox QR Ph integration through a backend.
- Deduct inventory only after successful payment confirmation.
- Record completed transactions.
- Avoid duplicate inventory deduction for the same paid transaction.
- Keep PayMongo secret keys out of the mobile application.
- After sign-in, offline in-memory data can support a catalog/cash UI demonstration, but only behind an off-by-default flag (`EXPO_PUBLIC_ALLOW_DEMO_CATALOG=1`). While that flag is off, an unreachable API produces an explicit offline state, no substituted products, and no locally recorded sale. QR Ph completion always requires Laravel confirmation.

## Brand Commitments

Product name: PorSca POS. The interface should feel practical, trustworthy, compact, and appropriate for a cashier using one hand while standing at a counter.

## Evidence on Hand

The project requirements, SQA documentation templates, and team timeline are maintained outside the runtime code. No production merchant claims or production payment credentials are present in the repository.

## Product Principles

1. Fast path first: scanning and checkout should require as few taps as possible.
2. Payment truth controls stock: inventory changes only after confirmed payment.
3. Clear recovery: errors explain what happened and how the cashier can continue.
4. Mobile-native behavior: respect platform navigation, safe areas, readable type, and touch targets.
5. Testable boundaries: UI, business rules, API calls, and payment integration remain separable for SQA automation.
