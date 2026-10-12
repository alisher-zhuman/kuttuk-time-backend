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
