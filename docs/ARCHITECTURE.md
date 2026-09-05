# Architecture

## Mobile app

The Expo app uses Expo Router and separates route screens from shared state, types, data, and visual tokens.

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
  components/
  context/
  data/
  theme/
  types/
```

`PosProvider` currently provides a functional in-memory implementation so the entire POS flow can be demonstrated before persistent storage is selected. It owns cart rules, stock checks, transaction creation, and stock deduction after successful payment.

## Backend

```text
server/
  src/index.ts
  package.json
  tsconfig.json
```

The backend exists for operations that must not run inside the Expo client, especially PayMongo secret-key calls and webhook processing.

## Intended production flow

```text
Phone camera
  -> barcode recognized
  -> product lookup
  -> cart
  -> checkout
       -> Cash: cashier confirms received amount
       -> QR Ph: backend creates PayMongo payment
  -> payment confirmed
  -> create transaction exactly once
  -> deduct stock exactly once
  -> show completed sale
```

## Payment safety boundary

The Expo application must never contain the PayMongo secret key. QR creation, payment status verification, and webhook verification belong on the backend.

A PayMongo `payment.paid` event should eventually be processed idempotently: receiving the same event twice must not create two sales or deduct stock twice.

## SQA seams

The project is intentionally structured so the course automation requirements can be added cleanly:

- Mobile frontend automation: Maestro or Appium can drive the Expo/Android application.
- Backend automation: Postman/Newman can exercise `/health`, product, transaction, and payment endpoints as the API grows.
- Defect monitoring and defect summary remain separate QA deliverables under project documentation rather than runtime app code.
