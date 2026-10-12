// Calendar months in UTC, clamping to the last day of the target month:
// Jan 31 + 1 → Feb 28 (or 29), Mar 31 + 1 → Apr 30. Time of day is kept.
export const addMonths = (date: Date, months: number): Date => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const result = new Date(date.getTime());

  result.setUTCDate(1);
  result.setUTCFullYear(year, month, Math.min(date.getUTCDate(), lastDayOfTarget));

  return result;
};
