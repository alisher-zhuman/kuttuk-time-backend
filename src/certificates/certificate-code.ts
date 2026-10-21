import { randomInt } from "node:crypto";

// A certificate code: 8 random digits, stored and returned as a string without spaces
// ("04718263" — leading zeros happen, never treat it as a number); shown as "0471 8263".
// Digits only (decided 2026-10-21): a cashier types it on the numeric keypad and a customer
// dictates it, no keyboard layouts or look-alike letters. 10^8 codes is plenty: a code is only
// ever checked by the merchant who sold it (no public lookup to brute-force) — guessing one
// means a person at the counter, ~1 in 200 000 per try with 500 active codes at a venue.
export const CERTIFICATE_CODE_LENGTH = 8;
export const CERTIFICATE_CODE_PATTERN = /^[0-9]{8}$/;

type RandomIndex = (max: number) => number;

// `random` is injectable only so property tests can drive every digit; production uses crypto.randomInt.
export const generateCertificateCode = (random: RandomIndex = randomInt): string =>
  Array.from({ length: CERTIFICATE_CODE_LENGTH }, () => String(random(10))).join("");

// What a cashier types → the stored code, or null if it can't be one. Spaces and dashes
// don't matter ("0471 8263", "0471-8263").
export const normalizeCertificateCode = (input: string): string | null => {
  const compact = input.replace(/[\s-]/g, "");

  return CERTIFICATE_CODE_PATTERN.test(compact) ? compact : null;
};

// "04718263" → "0471 8263" (bot messages; the frontend groups the same way).
export const formatCertificateCode = (code: string): string =>
  CERTIFICATE_CODE_PATTERN.test(code) ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
