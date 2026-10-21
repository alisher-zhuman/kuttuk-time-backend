import * as fc from "fast-check";

import {
  CERTIFICATE_CODE_PATTERN,
  formatCertificateCode,
  generateCertificateCode,
  normalizeCertificateCode,
} from "./certificate-code";

describe("certificate code (property-based)", () => {
  it("maps any 8 digits in [0, 10) to the code, digit by digit", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 }),
        (digits) => {
          const queue = [...digits];
          const maxes: number[] = [];

          const code = generateCertificateCode((max) => {
            maxes.push(max);

            return queue.shift()!;
          });

          expect(code).toBe(digits.join(""));
          expect(code).toMatch(CERTIFICATE_CODE_PATTERN);
          // Always asks for a digit over the full 0–9 range.
          expect(maxes).toEqual(Array(8).fill(10));
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("with the real crypto.randomInt: every code matches the format, leading zeros kept", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        expect(generateCertificateCode()).toMatch(CERTIFICATE_CODE_PATTERN);
      }),
      { numRuns: 2000 },
    );
  });

  it("normalize(format(code)) = code, and any spaces / dashes between digits are fine", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 }),
        fc.array(fc.constantFrom("", " ", "-", "  "), { minLength: 9, maxLength: 9 }),
        (digits, gaps) => {
          const code = digits.join("");
          const typed = digits.map((d, i) => `${gaps[i]}${d}`).join("") + gaps[8];

          expect(normalizeCertificateCode(formatCertificateCode(code))).toBe(code);
          expect(normalizeCertificateCode(typed)).toBe(code);
        },
      ),
      { numRuns: 2000 },
    );
  });
});
