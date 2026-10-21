import type { Language } from "@/common/translations";

// Texts of the bot itself (the chat, the profile). Telegram gives us the user's Telegram
// language (language_code), not the app's: "ky" → kg, ru, en; anything else → ru — the usual
// Telegram interface language in Kyrgyzstan.
export const botLanguage = (code?: string | null): Language => {
  const value = code?.trim().slice(0, 2).toLowerCase();

  if (value === "ky" || value === "kg") {
    return "kg";
  }

  return value === "en" ? "en" : "ru";
};

export const welcomeMessage = (lang: Language): string => {
  switch (lang) {
    case "ru":
      return "👋 Добро пожаловать в <b>KuttukTime</b>!\n\nПодарочные сертификаты заведений Бишкека — кофейни, рестораны, спа, салоны. Выберите, оплатите и подарите за 30 секунд.\n\nКоды ваших сертификатов будут приходить сюда.";
    case "en":
      return "👋 Welcome to <b>KuttukTime</b>!\n\nGift certificates from Bishkek venues — coffee shops, restaurants, spas, salons. Pick, pay and gift in 30 seconds.\n\nYour certificate codes will arrive here.";
    case "kg":
      return "👋 <b>KuttukTime</b>'га кош келиңиз!\n\nБишкектеги мекемелердин белек сертификаттары — кофейнялар, ресторандар, спа, салондор. 30 секундда тандап, төлөп, белекке бериңиз.\n\nСертификаттарыңыздын коддору ушул жерге келет.";
  }
};

// Any other message: the bot doesn't chat — point to the app and to support.
export const fallbackMessage = (lang: Language, support: string): string => {
  switch (lang) {
    case "ru":
      return `Всё делается в приложении 👇\n\nВопросы — ${support}`;
    case "en":
      return `Everything happens in the app 👇\n\nQuestions — ${support}`;
    case "kg":
      return `Баары колдонмодо 👇\n\nСуроолор — ${support}`;
  }
};

// The button under a message: "Open KuttukTime", or "Open <venue>" for a /start <slug> link.
export const openButton = (lang: Language, venue?: string): string => {
  const name = venue ?? "KuttukTime";

  switch (lang) {
    case "ru":
      return `Открыть ${name}`;
    case "en":
      return `Open ${name}`;
    case "kg":
      return `${name} ачуу`;
  }
};

// The menu button (left of the input). Set per chat at /start, so it's in the user's language.
export const menuButtonText = (lang: Language): string =>
  ({ ru: "Открыть", en: "Open", kg: "Ачуу" })[lang];

// Profile texts, set once by `npm run bot:setup`. description ≤ 512 chars (the empty chat,
// "What can this bot do?"), shortDescription ≤ 120 (the profile, link previews).
export const botProfile: Record<Language, { description: string; shortDescription: string }> = {
  ru: {
    description:
      "Подарочные сертификаты заведений Бишкека за 30 секунд: выберите заведение и номинал, оплатите и подарите код в Telegram. Без регистрации.",
    shortDescription: "Подарочные сертификаты заведений Бишкека за 30 секунд",
  },
  en: {
    description:
      "Gift certificates from Bishkek venues in 30 seconds: pick a venue and an amount, pay, and gift the code in Telegram. No sign-up.",
    shortDescription: "Gift certificates from Bishkek venues in 30 seconds",
  },
  kg: {
    description:
      "Бишкектеги мекемелердин белек сертификаттары 30 секундда: мекемени жана сумманы тандап, төлөп, кодду Telegram'да белекке бериңиз. Каттоосуз.",
    shortDescription: "Бишкектеги мекемелердин белек сертификаттары 30 секундда",
  },
};
