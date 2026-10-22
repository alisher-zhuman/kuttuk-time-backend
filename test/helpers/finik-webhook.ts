import { sign } from "../../src/finik/finik-signer";
import type { Order } from "../../src/orders/entities/order.entity";

// globalSetup's key pair plays "Finik": FINIK_PUBLIC_KEY_B64 is what the app verifies with.
const finikPrivateKey = () =>
  Buffer.from(process.env.FINIK_PRIVATE_KEY_B64 ?? "", "base64").toString("utf8");

const webhookUrl = () => new URL(process.env.FINIK_WEBHOOK_URL ?? "");

export const WEBHOOK_PATH = "/api/finik/webhook";

// Shaped like the webhook example in Finik's docs.
export const finikWebhookBody = (
  order: Pick<Order, "id" | "amount">,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  fields: {
    amount: order.amount,
    webhook_url: process.env.FINIK_WEBHOOK_URL,
    paymentId: order.id,
    success_redirect_url: `https://api.acquiring.averspay.kg/v1/redirect?paymentId=${order.id}&status=succeeded`,
    name: "KuttukTime",
    qrTransactionId: "aaa76e79-f808-4ac5-b88e-76a9b4055832",
  },
  amount: order.amount,
  transactionDate: Date.UTC(2026, 9, 20, 12, 0, 0),
  clientId: "25c1aabe-fc4a-4968-85d9-90600466e9a5",
  id: `320259584_${order.id}_DEBIT`,
  status: "succeeded",
  transactionId: order.id,
  data: {
    accountId: "test-account",
    description: "Test Merchant — 1000 KGS",
    webhookUrl: process.env.FINIK_WEBHOOK_URL,
    name_en: "KuttukTime",
  },
  ...overrides,
});

export const signWebhook = (
  body: Record<string, unknown>,
  opts: { host?: string; path?: string; query?: Record<string, string> } = {},
): Record<string, string> => {
  const timestamp = String(Date.now());

  const signature = sign(
    {
      httpMethod: "POST",
      path: opts.path ?? webhookUrl().pathname,
      headers: { Host: opts.host ?? webhookUrl().host, "x-api-timestamp": timestamp },
      queryStringParameters: opts.query ?? null,
      body,
    },
    finikPrivateKey(),
  );

  return { "x-api-timestamp": timestamp, signature };
};
