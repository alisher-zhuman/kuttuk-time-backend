export const VALID_NOMINALS = [
  // TEMP: 10 KGS for testing payments on prod — remove before launch, from here and from every
  // venue's nominals, data first (see CLAUDE.md TODOs).
  10, 500, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
];

export const VALID_VALIDITY_MONTHS = [3, 6, 12, 24];

// Path segments of GET /api/venues/* that would shadow a venue with that slug
// (GET /api/venues/:idOrSlug and the startapp=<slug> deep link would break).
// "me" isn't a venues route; it stays reserved since it always was (no slug can hold it).
export const RESERVED_SLUGS = ["me", "options"];
