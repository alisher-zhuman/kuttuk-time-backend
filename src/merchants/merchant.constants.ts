export const VALID_NOMINALS = [
  // TEMP: 10 KGS for testing payments on prod — remove before launch, together with the
  // frontend's NOMINAL_PRESETS entry and from every merchant's nominals (see CLAUDE.md TODOs).
  10, 500, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
];

export const VALID_VALIDITY_MONTHS = [3, 6, 12, 24];

// Path segments of GET /api/merchants/* that would shadow a merchant with that slug
// (GET /api/merchants/:idOrSlug and the startapp=<slug> deep link would break).
export const RESERVED_SLUGS = ["me", "options"];
