export const VALID_NOMINALS = [
  // TEMP: 10 KGS for testing payments on prod - remove before launch, from here and from every
  // venue's nominals, data first (see CLAUDE.md TODOs).
  10, 500, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
];

export const VALID_VALIDITY_MONTHS = [3, 6, 12, 24];

// Path segments of GET /api/venues/* that would shadow a venue with that slug
// (GET /api/venues/:idOrSlug and the startapp=<slug> deep link would break).
// "me" isn't a venues route; it stays reserved since it always was (no slug can hold it).
export const RESERVED_SLUGS = ["me", "options"];

// A venue name goes into Telegram texts with hard limits (the redemption confirm popup: 256
// chars in all), so it stays short.
export const VENUE_NAME_MAX = 100;

// Where the venue is (2026-11-10): one free-text address (written the same in every language),
// and a link to it on a map. Optional; set by the owner or the admin.
export const VENUE_ADDRESS_MAX = 200;

// Buyers open this link, so it's https on a map service only - never an arbitrary site:
// 2GIS (2gis.kg / .ru / .com, go.2gis.com), Google Maps (google.*/maps, maps.app.goo.gl,
// goo.gl/maps), Yandex Maps (yandex.*/maps).
export const MAP_URL =
  /^https:\/\/(?:(?:www\.)?2gis\.(?:kg|ru|com)\/|go\.2gis\.com\/|maps\.app\.goo\.gl\/|goo\.gl\/maps\/|(?:www\.)?google\.(?:com|kg|ru)\/maps|(?:www\.)?yandex\.(?:ru|kg|com)\/maps)\S*$/;
export const MAP_URL_MAX = 500;
