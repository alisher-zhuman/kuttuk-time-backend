// When a certificate stops working: the end of the day (23:59:59.999 in Bishkek) that is
// `months` calendar months after the purchase day in Bishkek - «Действует до 10.11.2027» means
// the whole of 10.11. A missing day clamps to the month's end: 31.01 + 1 → 28.02 / 29.02.
// Bishkek is UTC+6 all year (no DST since 2005) - a fixed offset is exact.
const BISHKEK_OFFSET_MS = 6 * 60 * 60 * 1000;

export const certificateValidUntil = (paidAt: Date, months: number): Date => {
  const local = new Date(paidAt.getTime() + BISHKEK_OFFSET_MS); // its UTC fields = Bishkek's
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(local.getUTCDate(), lastDay);

  return new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - BISHKEK_OFFSET_MS);
};
