// Dates as the app shows them: dd.mm.yyyy (and HH:MM) in Bishkek time, whatever the server zone.
const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bishkek",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const parts = (date: Date) =>
  Object.fromEntries(PARTS.formatToParts(date).map(({ type, value }) => [type, value]));

export const bishkekDate = (date: Date): string => {
  const { day, month, year } = parts(date);

  return `${day}.${month}.${year}`;
};

export const bishkekTime = (date: Date): string => {
  const { hour, minute } = parts(date);

  return `${hour}:${minute}`;
};
