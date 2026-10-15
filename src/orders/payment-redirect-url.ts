// Must match ORDER_START_PARAM_PREFIX in ../frontend src/shared/constants/base.ts:
// the Mini App opens the order screen for startapp=order_<uuid>.
export const ORDER_START_PARAM_PREFIX = "order_";

// Where Finik sends the buyer after paying: the Mini App, straight on this order.
// Built with URL/searchParams so an existing query in FINIK_REDIRECT_URL survives;
// an existing startapp is replaced.
export const paymentRedirectUrl = (base: string, orderId: string): string => {
  const url = new URL(base);

  url.searchParams.set("startapp", `${ORDER_START_PARAM_PREFIX}${orderId}`);

  return url.toString();
};
