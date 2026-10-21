import type { Language } from "@/common/translations";
import { bishkekDate } from "@/common/utils/bishkek-format";
import { formatCertificateCode } from "@/certificates/certificate-code";
import { escapeHtml } from "@/telegram/telegram-bot.service";

// "Expires soon" reminder to the certificate's owner.
export const expiryMessage = (
  lang: Language,
  c: { venue: string; amount: number; code: string; validUntil: Date },
): { html: string; button: string } => {
  const venue = `<b>${escapeHtml(c.venue)}</b>`;
  const code = `<code>${formatCertificateCode(c.code)}</code>`;
  const until = bishkekDate(c.validUntil);

  switch (lang) {
    case "ru":
      return {
        html: `⏳ Сертификат ${code} в ${venue} на ${c.amount} сом действует до ${until}.\n\nНе забудьте воспользоваться.`,
        button: "Открыть сертификат",
      };
    case "en":
      return {
        html: `⏳ Your certificate ${code} for ${venue}, ${c.amount} KGS, is valid until ${until}.\n\nDon't forget to use it.`,
        button: "Open certificate",
      };
    case "kg":
      return {
        html: `⏳ ${venue} мекемесиндеги ${c.amount} сомдук ${code} сертификатыңыз ${until} чейин жарактуу.\n\nКолдонууну унутпаңыз.`,
        button: "Сертификатты ачуу",
      };
  }
};
