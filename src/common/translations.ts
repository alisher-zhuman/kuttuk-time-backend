export const LANGUAGES = ["ru", "kg", "en"] as const;

export type Language = (typeof LANGUAGES)[number];

// Every multilingual field (merchant description, category name) has all three, enforced by
// the DTOs (IsTranslations) and by CHECK constraints in the DB.
export type Translations = Record<Language, string>;
