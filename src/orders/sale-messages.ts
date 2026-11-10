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

export const buyerMessage = (
  lang: Language,
  sale: BuyerSale,
): { html: string; button: string; copy: string } => {
  const venue = `<b>${escapeHtml(sale.venue)}</b>`;
  const code = `<code>${formatCertificateCode(sale.code)}</code>`;
  const until = bishkekDate(sale.validUntil);

  switch (lang) {
    case "ru":
      return {
        html: `🎁 Ваш подарочный сертификат в ${venue} на ${sale.amount} сом\n\nКод: ${code}\nДействует до ${until}\n\nПокажите код на месте - его отметят как использованный.`,
        button: "Открыть сертификат",
        copy: "Скопировать код",
      };
    case "en":
      return {
        html: `🎁 Your gift certificate for ${venue}, ${sale.amount} KGS\n\nCode: ${code}\nValid until ${until}\n\nShow the code at the venue - it will be marked as used.`,
        button: "Open certificate",
        copy: "Copy code",
      };
    case "kg":
      return {
        html: `🎁 ${venue} мекемесиндеги ${sale.amount} сомдук белек сертификатыңыз\n\nКод: ${code}\n${until} чейин жарактуу\n\nКодду жеринде көрсөтүңүз - аны колдонулду деп белгилешет.`,
        button: "Сертификатты ачуу",
        copy: "Кодду көчүрүү",
      };
  }
};

// To the venue's owner: no buyer data and no code - the code only matters when the customer
// comes in, and they show it then.
export const ownerMessage = (
  lang: Language,
  sale: { venue: string; amount: number },
): { html: string; button: string } => {
  const venue = `<b>${escapeHtml(sale.venue)}</b>`;

  switch (lang) {
    case "ru":
      return { html: `🎉 Новая продажа: ${venue} - ${sale.amount} сом`, button: "Открыть кабинет" };
    case "en":
      return { html: `🎉 New sale: ${venue} - ${sale.amount} KGS`, button: "Open cabinet" };
    case "kg":
      return { html: `🎉 Жаңы сатуу: ${venue} - ${sale.amount} сом`, button: "Кабинетти ачуу" };
  }
};

// To the buyer when the paid amount didn't match the order (needs_review): the money is taken,
// no certificate yet - say so at once, so they don't think it's lost, and give the order back.
export const reviewMessage = (
  lang: Language,
  sale: { venue: string },
): { html: string; button: string } => {
  const venue = `<b>${escapeHtml(sale.venue)}</b>`;

  switch (lang) {
    case "ru":
      return {
        html: `💳 Мы получили вашу оплату сертификата в ${venue}, но сумма отличается от заказа.\n\nПроверим платёж вручную и напишем вам здесь.`,
        button: "Открыть заказ",
      };
    case "en":
      return {
        html: `💳 We received your payment for a certificate at ${venue}, but the amount differs from the order.\n\nWe'll check the payment by hand and write to you here.`,
        button: "Open order",
      };
    case "kg":
      return {
        html: `💳 ${venue} мекемесиндеги сертификат үчүн төлөмүңүздү алдык, бирок сумма буйрутмадан айырмаланат.\n\nТөлөмдү кол менен текшерип, сизге ушул жерге жазабыз.`,
        button: "Буйрутманы ачуу",
      };
  }
};

// To the buyer after the money was returned by hand (orders:resolve-review --refunded).
export const refundedMessage = (
  lang: Language,
  sale: { venue: string; amount: number },
): { html: string; button: string } => {
  const venue = `<b>${escapeHtml(sale.venue)}</b>`;

  switch (lang) {
    case "ru":
      return {
        html: `↩️ Деньги за заказ сертификата в ${venue} (${sale.amount} сом) возвращены.\n\nЕсли остались вопросы - напишите нам.`,
        button: "Написать в поддержку",
      };
    case "en":
      return {
        html: `↩️ The money for your certificate order at ${venue} (${sale.amount} KGS) has been returned.\n\nAny questions - write to us.`,
        button: "Contact support",
      };
    case "kg":
      return {
        html: `↩️ ${venue} мекемесиндеги сертификат буйрутмасы үчүн акча (${sale.amount} сом) кайтарылды.\n\nСуроолоруңуз болсо - бизге жазыңыз.`,
        button: "Колдоого жазуу",
      };
  }
};
