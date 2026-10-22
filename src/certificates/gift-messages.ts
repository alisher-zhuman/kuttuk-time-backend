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

// The card a buyer sends to a friend from the Mini App ("Подарить"), in the buyer's language.
// title / description — how it looks in Telegram's chat picker; html — the message itself.
export const giftCard = (
  lang: Language,
  g: GiftCard,
): { title: string; description: string; html: string; open: string; copy: string } => {
  const venue = `<b>${escapeHtml(g.venue)}</b>`;
  const shown = formatCertificateCode(g.code);
  const code = `<code>${shown}</code>`;
  const until = bishkekDate(g.validUntil);

  switch (lang) {
    case "ru":
      return {
        title: `🎁 Сертификат в ${g.venue} — ${g.amount} сом`,
        description: `Код ${shown} · до ${until}`,
        html: `🎁 Тебе подарок — сертификат в ${venue} на ${g.amount} сом\n\nКод: ${code}\nДействует до ${until}\n\nПокажи этот QR или код на кассе.`,
        open: `Открыть ${g.venue}`,
        copy: "Скопировать код",
      };
    case "en":
      return {
        title: `🎁 Certificate for ${g.venue} — ${g.amount} KGS`,
        description: `Code ${shown} · until ${until}`,
        html: `🎁 A gift for you — a certificate for ${venue}, ${g.amount} KGS\n\nCode: ${code}\nValid until ${until}\n\nShow this QR or the code at the counter.`,
        open: `Open ${g.venue}`,
        copy: "Copy code",
      };
    case "kg":
      return {
        title: `🎁 ${g.venue} — ${g.amount} сомдук сертификат`,
        description: `Код ${shown} · ${until} чейин`,
        html: `🎁 Сага белек — ${venue} мекемесиндеги ${g.amount} сомдук сертификат\n\nКод: ${code}\n${until} чейин жарактуу\n\nБул QR же кодду кассада көрсөт.`,
        open: `${g.venue} ачуу`,
        copy: "Кодду көчүрүү",
      };
  }
};
