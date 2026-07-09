export function resolveTranslation(
  translations: Record<string, string> | null,
  lang: string,
): string | null {
  if (!translations) {
    return null;
  }

  return (
    translations[lang] ??
    translations["kg"] ??
    translations["ru"] ??
    translations["en"] ??
    Object.values(translations)[0] ??
    null
  );
}
