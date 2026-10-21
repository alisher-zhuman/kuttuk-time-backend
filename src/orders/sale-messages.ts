import type { Language } from "@/common/translations";
import { bishkekDate } from "@/common/utils/bishkek-format";
import { formatCertificateCode } from "@/certificates/certificate-code";
import { escapeHtml } from "@/telegram/telegram-bot.service";

// Bot message texts. kg is the app's default (unknown language → kg). The code goes in <code>,
// so Telegram copies it on tap.

export interface BuyerSale {
  venue: string;
  amount: number;
  code: string;
  validUntil: Date;
}

export const buyerMessage = (lang: Language, sale: BuyerSale): { html: string; button: string } => {
  const venue = `<b>${escapeHtml(sale.venue)}</b>`;
  const code = `<code>${formatCertificateCode(sale.code)}</code>`;
  const until = bishkekDate(sale.validUntil);

  switch (lang) {
    case "ru":
      return {
        html: `🎁 Ваш подарочный сертификат в ${venue} на ${sale.amount} сом\n\nКод: ${code}\nДействует до ${until}\n\nПокажите код на месте — его отметят как использованный.`,
        button: "Открыть сертификат",
      };
    case "en":
      return {
        html: `🎁 Your gift certificate for ${venue}, ${sale.amount} KGS\n\nCode: ${code}\nValid until ${until}\n\nShow the code at the venue — it will be marked as used.`,
        button: "Open certificate",
      };
    case "kg":
      return {
        html: `🎁 ${venue} мекемесиндеги ${sale.amount} сомдук белек сертификатыңыз\n\nКод: ${code}\n${until} чейин жарактуу\n\nКодду жеринде көрсөтүңүз — аны колдонулду деп белгилешет.`,
        button: "Сертификатты ачуу",
      };
  }
};

// To the venue's owner: no buyer data and no code — the code only matters when the customer
// comes in, and they show it then.
export const ownerMessage = (
  lang: Language,
  sale: { venue: string; amount: number },
): { html: string; button: string } => {
  const venue = `<b>${escapeHtml(sale.venue)}</b>`;

  switch (lang) {
    case "ru":
      return { html: `🎉 Новая продажа: ${venue} — ${sale.amount} сом`, button: "Открыть кабинет" };
    case "en":
      return { html: `🎉 New sale: ${venue} — ${sale.amount} KGS`, button: "Open cabinet" };
    case "kg":
      return { html: `🎉 Жаңы сатуу: ${venue} — ${sale.amount} сом`, button: "Кабинетти ачуу" };
  }
};
