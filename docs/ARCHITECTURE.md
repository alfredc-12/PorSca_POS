# Architecture

## Release boundary

Expo/React Native is the only user-facing frontend. Laravel (`niks0501/PorSca_POS_API`) is the sole backend for staging and release. Mobile code calls the API only through [`src/api/client.ts`](../src/api/client.ts), which is configured by `EXPO_PUBLIC_API_URL` and uses contract version `porsca-mobile-api-v1`.

The mobile bundle never contains PayMongo secrets. QR creation, payment status checks, webhook verification, sale persistence, idempotency, and final inventory deduction belong to Laravel.

## Mobile app

Expo Router separates route screens from shared state, types, data, rules, and visual tokens:

```text
app/
  _layout.tsx
  index.tsx
  scanner.tsx
  checkout.tsx
  product-form.tsx
  (tabs)/
    _layout.tsx
    pos.tsx
    inventory.tsx
    transactions.tsx
src/
  api/client.ts       # the single configurable network boundary
  components/         # shared visual controls
  context/            # POS session state and local fallback
  data/               # seeded local demonstration data
  domain/pos.ts       # behavior rules and money/stock calculations
  hooks/
  theme/
  types/
```

`PosProvider` currently owns a functional in-memory fallback so a cashier can demonstrate the approved flow without a backend. It applies the same cart, stock, cash, payment-state, and exactly-once deduction rules used by the fast suite. When an API URL is configured it can refresh products through `ApiClient`; an unavailable API leaves the seeded fallback in place. The Laravel promotion replaces this fallback only after parity and formal QA evidence.

## Intended flow

```text
Phone camera/search
  -> product lookup through the session/API boundary
  -> cart and total rules
  -> checkout
       -> Cash: cashier confirms received amount
       -> QR Ph: backend creates PayMongo payment
  -> confirmed payment
  -> API records the sale with an idempotency key
  -> API deducts stock exactly once
  -> transaction history
```

Unpaid, failed, cancelled, expired, or pending payments do not create a sale or change stock. Repeating a paid request with the same idempotency key returns the original result and does not deduct inventory again.

## API resources

The mobile client covers products, inventory, sales, transactions, and payments. Endpoint shapes and response/error rules are recorded in [API-CONTRACT.md](API-CONTRACT.md); keep screens free of endpoint details. The API track owns Postman/Newman backend automation and Laravel implementation.

## SQA seams

- Fast local/PR seam: `npm run verify` (lint, typecheck, Jest, and React Native Testing Library).
- Formal frontend seam: Appium + native Android, under `automation/appium/`, after the staging gate.
- Formal backend seam: the API track's Postman/Newman contract.
- Defect truth: GitHub Issues and the shared cycle record in [WORKFLOW.md](WORKFLOW.md).
- Evidence: Appium, Postman/Newman, Jest/RNTL, and Laravel artifacts. Large raw logs stay in artifact storage.

The approved smartphone-first design and cashier flow remain in [DESIGN.md](../DESIGN.md) and [PRODUCT.md](../PRODUCT.md). This boundary work does not change their visual or task order.
