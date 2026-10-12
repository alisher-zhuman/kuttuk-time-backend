import { randomInt } from "node:crypto";

// 32 symbols: digits and Latin capitals without the look-alikes 0/O and 1/I.
export const CERTIFICATE_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const group = (): string =>
  Array.from(
    { length: 4 },
    () => CERTIFICATE_CODE_ALPHABET[randomInt(CERTIFICATE_CODE_ALPHABET.length)],
  ).join("");

export const generateCertificateCode = (): string => `KT-${group()}-${group()}`;
