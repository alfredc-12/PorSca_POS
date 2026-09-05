# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

Expo SDK 57, React Native, TypeScript, Expo Router. A small Node/Express backend is included for secret-bearing integrations such as PayMongo QR Ph.

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
- Manage product name, barcode, price, and stock quantity.
- Record cash received and calculate change.
- Support a PayMongo sandbox QR Ph integration through a backend.
- Deduct inventory only after successful payment confirmation.
- Record completed transactions.
- Avoid duplicate inventory deduction for the same paid transaction.
- Keep PayMongo secret keys out of the mobile application.
- Current scaffold uses in-memory mock data so the Expo UI can run before persistent storage is connected.

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
