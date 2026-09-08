# Deprecated local Express scaffold

> **Deprecated:** this server is not the staging or release backend. Laravel in [`niks0501/PorSca_POS_API`](https://github.com/niks0501/PorSca_POS_API) is the sole backend for the release unit.

Keep this small scaffold while the Laravel API reaches parity. It preserves local health and existing checkout/payment-boundary demonstrations. Do not add new product, inventory, sale, transaction, or PayMongo behavior here. New API work belongs in Laravel and must follow the mobile contract in [`../docs/API-CONTRACT.md`](../docs/API-CONTRACT.md).

Run locally only when needed:

```bash
npm install
cp .env.example .env
npm run dev
```

`PAYMONGO_SECRET_KEY` belongs in `server/.env` only. The scaffold does not enable the real provider adapter.
