import type { Language } from "@/common/translations";
import { escapeHtml } from "@/telegram/telegram-bot.service";

// "2026-10-20" → "20.10.2026".
const dmy = (date: string): string => date.split("-").reverse().join(".");
const MAX_LINES = 40; // a Telegram message is ≤ 4096 chars

export interface PayoutReminder {
  from: string;
  to: string;
  // Merchants still owed money for the week (due > 0), in report order.
  due: Array<{ merchantName: string; due: number }>;
  // Still owed from earlier weeks.
  older?: Array<{ merchantName: string; due: number }>;
  needsReviewCount: number;
}

// The Monday reminder to the admin. due empty + needsReviewCount 0 → nothing is sent (caller).
export const payoutReminderMessage = (
  lang: Language,
  r: PayoutReminder,
): { html: string; button: string } => {
  const period = `${dmy(r.from)}–${dmy(r.to)}`;
  const total = r.due.reduce((sum, m) => sum + m.due, 0);
  const t = {
    ru: {
      head: `💸 Пора выплатить за ${period}:`,
      none: `💸 За ${period} выплачивать нечего.`,
      more: (n: number) => `… и ещё ${n}`,
      total: `Итого: <b>${total} сом</b>`,
      review: `⚠️ На проверке: ${r.needsReviewCount} — не входит в выплату, сначала разобрать.`,
      older: "⏳ Не выплачено за прошлые недели:",
      cur: "сом",
      button: "Открыть приложение",
    },
    en: {
      head: `💸 Time to pay out for ${period}:`,
      none: `💸 Nothing to pay out for ${period}.`,
      more: (n: number) => `… and ${n} more`,
      total: `Total: <b>${total} KGS</b>`,
      review: `⚠️ Needs review: ${r.needsReviewCount} — not included, resolve first.`,
      older: "⏳ Still unpaid from earlier weeks:",
      cur: "KGS",
      button: "Open the app",
    },
    kg: {
      head: `💸 ${period} үчүн төлөп берүү убактысы келди:`,
      none: `💸 ${period} үчүн төлөп бере турган эч нерсе жок.`,
      more: (n: number) => `… дагы ${n}`,
      total: `Жалпы: <b>${total} сом</b>`,
      review: `⚠️ Текшерүүдө: ${r.needsReviewCount} — төлөп берүүгө кирбейт, адегенде чечиңиз.`,
      older: "⏳ Мурунку апталар үчүн төлөнө элек:",
      cur: "сом",
      button: "Колдонмону ачуу",
    },
  }[lang];

  const lines = r.due
    .slice(0, MAX_LINES)
    .map((m) => `• ${escapeHtml(m.merchantName)} — ${m.due} ${t.cur}`);

  if (r.due.length > MAX_LINES) {
    lines.push(t.more(r.due.length - MAX_LINES));
  }

  const parts = r.due.length > 0 ? [t.head, lines.join("\n"), t.total] : [t.none];

  const older = r.older ?? [];

  if (older.length > 0) {
    parts.push(
      [
        t.older,
        ...older
          .slice(0, MAX_LINES)
          .map((m) => `• ${escapeHtml(m.merchantName)} — ${m.due} ${t.cur}`),
      ].join("\n"),
    );
  }

  if (r.needsReviewCount > 0) {
    parts.push(t.review);
  }

  return { html: parts.join("\n\n"), button: t.button };
};
