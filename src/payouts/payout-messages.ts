import type { Language } from "@/common/translations";

// "2026-10-19" → "19.10.2026" (calendar dates, no time zone involved).
const dmy = (date: string): string => date.split("-").reverse().join(".");

export const payoutMessage = (
  lang: Language,
  p: {
    periodFrom: string;
    periodTo: string;
    ordersCount: number;
    gross: number;
    commission: number;
    payout: number;
  },
): { html: string; button: string } => {
  const period = `${dmy(p.periodFrom)}–${dmy(p.periodTo)}`;

  switch (lang) {
    case "ru":
      return {
        html: `💸 Выплата: <b>${p.payout} сом</b> за ${period}\n\nПродаж: ${p.ordersCount} на ${p.gross} сом, комиссия ${p.commission} сом`,
        button: "Открыть кабинет",
      };
    case "en":
      return {
        html: `💸 Paid out: <b>${p.payout} KGS</b> for ${period}\n\nSales: ${p.ordersCount} for ${p.gross} KGS, commission ${p.commission} KGS`,
        button: "Open cabinet",
      };
    case "kg":
      return {
        html: `💸 Төлөп берилди: <b>${p.payout} сом</b> (${period})\n\nСатуулар: ${p.ordersCount}, жалпы ${p.gross} сом, комиссия ${p.commission} сом`,
        button: "Кабинетти ачуу",
      };
  }
};
