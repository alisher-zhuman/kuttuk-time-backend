import { formatCertificateCode } from "./certificate-code";
import type { Language } from "@/common/translations";
import { bishkekDate } from "@/common/utils/bishkek-format";
import { escapeHtml } from "@/telegram/telegram-bot.service";

export interface GiftCard {
  venue: string;
  amount: number;
  code: string;
  validUntil: Date;
}

// The card the owner sends to a friend from the Mini App ("Подарить"), in the buyer's language.
// title / description - how it looks in Telegram's chat picker; html - the message itself.
export const giftCard = (
  lang: Language,
  g: GiftCard,
): { title: string; description: string; html: string; claim: string; copy: string } => {
  const venue = `<b>${escapeHtml(g.venue)}</b>`;
  const shown = formatCertificateCode(g.code);
  const code = `<code>${shown}</code>`;
  const until = bishkekDate(g.validUntil);

  switch (lang) {
    case "ru":
      return {
        title: `🎁 Сертификат в ${g.venue} - ${g.amount} сом`,
        description: `Код ${shown} · до ${until}`,
        html: `🎁 Тебе подарок - сертификат в ${venue} на ${g.amount} сом\n\nКод: ${code}\nДействует до ${until}\n\nПокажи этот QR или код на кассе. Нажми «Забрать подарок» - и сертификат будет у тебя в приложении.`,
        claim: "🎁 Забрать подарок",
        copy: "Скопировать код",
      };
    case "en":
      return {
        title: `🎁 Certificate for ${g.venue} - ${g.amount} KGS`,
        description: `Code ${shown} · until ${until}`,
        html: `🎁 A gift for you - a certificate for ${venue}, ${g.amount} KGS\n\nCode: ${code}\nValid until ${until}\n\nShow this QR or the code at the counter. Tap "Claim gift" to keep the certificate in the app.`,
        claim: "🎁 Claim gift",
        copy: "Copy code",
      };
    case "kg":
      return {
        title: `🎁 ${g.venue} - ${g.amount} сомдук сертификат`,
        description: `Код ${shown} · ${until} чейин`,
        html: `🎁 Сага белек - ${venue} мекемесиндеги ${g.amount} сомдук сертификат\n\nКод: ${code}\n${until} чейин жарактуу\n\nБул QR же кодду кассада көрсөт. «Белекти алуу» баскычын бас - сертификат колдонмодо сенде болот.`,
        claim: "🎁 Белекти алуу",
        copy: "Кодду көчүрүү",
      };
  }
};

// To the giver, once the friend tapped «Забрать» - the gift reached them.
export const giftClaimedMessage = (
  lang: Language,
  g: { venue: string; amount: number },
): string => {
  const venue = `<b>${escapeHtml(g.venue)}</b>`;

  switch (lang) {
    case "ru":
      return `🎁 Ваш подарок забрали - сертификат в ${venue} на ${g.amount} сом теперь у получателя.`;
    case "en":
      return `🎁 Your gift was claimed - the certificate for ${venue}, ${g.amount} KGS, is now with the recipient.`;
    case "kg":
      return `🎁 Белегиңизди алышты - ${venue} мекемесиндеги ${g.amount} сомдук сертификат эми алуучуда.`;
  }
};

// To the giver, when the friend used the gift (the friend gets the usual redemption notice).
export const giftUsedMessage = (
  lang: Language,
  g: { venue: string; amount: number; usedAt: Date },
): string => {
  const venue = `<b>${escapeHtml(g.venue)}</b>`;
  const date = bishkekDate(g.usedAt);

  switch (lang) {
    case "ru":
      return `🎉 Ваш подарок использовали - сертификат в ${venue} на ${g.amount} сом, ${date}.`;
    case "en":
      return `🎉 Your gift was used - the certificate for ${venue}, ${g.amount} KGS, on ${date}.`;
    case "kg":
      return `🎉 Белегиңизди колдонушту - ${venue} мекемесиндеги ${g.amount} сомдук сертификат, ${date}.`;
  }
};
