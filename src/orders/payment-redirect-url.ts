// Must match ORDER_START_PARAM_PREFIX in ../frontend src/shared/constants/base.ts:
// the Mini App opens the order screen for startapp=order_<uuid>.
export const ORDER_START_PARAM_PREFIX = "order_";

// The Mini App link (FINIK_REDIRECT_URL = t.me/<bot>/app) opened on a start param: a venue
// slug, or order_<uuid>. The one place that builds it — with URL/searchParams, so an existing
// query in the base survives and an existing startapp is replaced. No param → the bare link.
export const miniAppLink = (base: string, startParam?: string): string => {
  if (!startParam) {
    return base;
  }

  const url = new URL(base);

  url.searchParams.set("startapp", startParam);

  return url.toString();
};

// The final destination after paying: the Mini App, straight on this order.
export const paymentRedirectUrl = (base: string, orderId: string): string =>
  miniAppLink(base, `${ORDER_START_PARAM_PREFIX}${orderId}`);

// What Finik gets as RedirectUrl: our own GET /api/payments/return/:orderId, which then 302s
// to paymentRedirectUrl(). Finik's intermediate redirect mangled a direct t.me link (the buyer
// landed in the bot chat with "An error occurred"), so the final link is built on our side.
// The public origin is taken from FINIK_WEBHOOK_URL — it must already be our exact public URL.
export const paymentReturnUrl = (webhookUrl: string, orderId: string): string =>
  `${new URL(webhookUrl).origin}/api/payments/return/${encodeURIComponent(orderId)}`;
