import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'porsca-pos-api' });
});

const qrRequest = z.object({
  transactionId: z.string().min(1),
  amount: z.number().positive(),
});

app.post('/api/payments/qrph', async (req, res) => {
  const parsed = qrRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid QR Ph payment request.', details: parsed.error.flatten() });
  }

  if (!process.env.PAYMONGO_SECRET_KEY) {
    return res.status(503).json({
      error: 'PayMongo sandbox is not configured.',
      hint: 'Add PAYMONGO_SECRET_KEY to server/.env before enabling the sandbox integration.',
    });
  }

  // PayMongo must be called from this backend, never directly from the Expo app.
  // The exact Payment Intent + QR Ph adapter is intentionally isolated here so the
  // mobile client never receives a secret key. Wire the current PayMongo sandbox
  // API contract into this route when the group receives/creates its sandbox keys.
  return res.status(501).json({
    error: 'QR Ph provider adapter is not enabled yet.',
    transactionId: parsed.data.transactionId,
    amount: parsed.data.amount,
  });
});

app.post('/api/webhooks/paymongo', (req, res) => {
  // TODO: verify PayMongo webhook authenticity before trusting event data.
  // On payment.paid, persist the sale exactly once and deduct inventory in one
  // backend transaction. Failed/expired payments must not change inventory.
  console.info('PayMongo webhook received', req.body?.type ?? 'unknown-event');
  res.sendStatus(200);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`PorSca POS API listening on http://0.0.0.0:${port}`);
});
