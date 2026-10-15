import { LANGUAGES, type Language, type Translations } from "../translations";

// Unknown language (e.g. a raw Accept-Language) falls back to kg, the default.
export const resolveTranslation = (translations: Translations, lang: string): string =>
  (LANGUAGES as readonly string[]).includes(lang)
    ? translations[lang as Language]
    : translations.kg;
