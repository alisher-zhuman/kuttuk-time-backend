export const LANGUAGES = ["ru", "kg", "en"] as const;

export type Language = (typeof LANGUAGES)[number];

// Every multilingual field (merchant description, category name) has all three, enforced by
// the DTOs (IsTranslations) and by CHECK constraints in the DB.
export type Translations = Record<Language, string>;

// The app's language from an Accept-Language header (the frontend sends its i18n language:
// "kg" / "ru" / "en"); "ky" is the ISO code for Kyrgyz. Anything else → null (unknown).
export const toLanguage = (header?: string | null): Language | null => {
  const code = header?.trim().slice(0, 2).toLowerCase();

  if (code === "ky") {
    return "kg";
  }

  return (LANGUAGES as readonly string[]).includes(code ?? "") ? (code as Language) : null;
};
