import type { Language } from "@/common/translations";
import { bishkekDate, bishkekTime } from "@/common/utils/bishkek-format";
import { escapeHtml } from "@/telegram/telegram-bot.service";

// To the certificate's owner right after it was redeemed: if it wasn't them, they know at once.
export const redeemedMessage = (
  lang: Language,
  r: { venue: string; amount: number; code: string; usedAt: Date },
): { html: string; button: string } => {
  const venue = `<b>${escapeHtml(r.venue)}</b>`;
  const code = `<code>${escapeHtml(r.code)}</code>`;
  const date = bishkekDate(r.usedAt);
  const time = bishkekTime(r.usedAt);

  switch (lang) {
    case "ru":
      return {
        html: `✅ Сертификат ${code} в ${venue} на ${r.amount} сом использован ${date} в ${time}.\n\nЕсли это были не вы — напишите нам.`,
        button: "Написать в поддержку",
      };
    case "en":
      return {
        html: `✅ Certificate ${code} for ${venue}, ${r.amount} KGS, was used on ${date} at ${time}.\n\nIf it wasn't you, write to us.`,
        button: "Contact support",
      };
    case "kg":
      return {
        html: `✅ ${venue} мекемесиндеги ${r.amount} сомдук ${code} сертификаты ${date} саат ${time} колдонулду.\n\nЭгер бул сиз болбосоңуз — бизге жазыңыз.`,
        button: "Колдоого жазуу",
      };
  }
};
