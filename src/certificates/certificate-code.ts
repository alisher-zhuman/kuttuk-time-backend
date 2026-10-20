import { randomInt } from "node:crypto";

// 32 symbols: digits and Latin capitals without the look-alikes 0/O and 1/I.
export const CERTIFICATE_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

type RandomIndex = (max: number) => number;

const group = (random: RandomIndex): string =>
  Array.from(
    { length: 4 },
    () => CERTIFICATE_CODE_ALPHABET[random(CERTIFICATE_CODE_ALPHABET.length)],
  ).join("");

// `random` is injectable only so property tests can drive every index; production uses crypto.randomInt.
export const generateCertificateCode = (random: RandomIndex = randomInt): string =>
  `KT-${group(random)}-${group(random)}`;

const BODY = new RegExp(`^[${CERTIFICATE_CODE_ALPHABET}]{8}$`);

// Cyrillic capitals that look exactly like Latin ones — a cashier on a Russian keyboard
// types "КТ-АВСЕ-…" and sees the same characters as on the screen.
const CYRILLIC_LOOKALIKES: Record<string, string> = {
  А: "A",
  В: "B",
  Е: "E",
  К: "K",
  М: "M",
  Н: "H",
  Р: "P",
  С: "C",
  Т: "T",
  Х: "X",
  У: "Y",
};

// What a cashier types → the canonical KT-XXXX-XXXX, or null if it can't be a code.
// Case, spaces and dashes don't matter; the "KT" prefix is optional; Cyrillic look-alikes
// count as Latin. 0/O/1/I aren't in the alphabet, so they make the input invalid
// rather than being guessed.
export const normalizeCertificateCode = (input: string): string | null => {
  let compact = input
    .replace(/[\s-]/g, "")
    .toUpperCase()
    .replace(/[АВЕКМНРСТХУ]/g, (ch) => CYRILLIC_LOOKALIKES[ch]);

  if (compact.length === 10 && compact.startsWith("KT")) {
    compact = compact.slice(2);
  }

  return BODY.test(compact) ? `KT-${compact.slice(0, 4)}-${compact.slice(4)}` : null;
};
