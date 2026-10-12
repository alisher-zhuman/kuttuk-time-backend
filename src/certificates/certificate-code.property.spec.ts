import * as fc from "fast-check";

import { CERTIFICATE_CODE_ALPHABET, generateCertificateCode } from "./certificate-code";

const CODE = /^KT-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

describe("generateCertificateCode (property-based)", () => {
  it("maps any 8 indices in [0, 32) to KT-XXXX-XXXX, symbol by symbol", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 31 }), { minLength: 8, maxLength: 8 }),
        (indices) => {
          const queue = [...indices];
          const maxes: number[] = [];

          const code = generateCertificateCode((max) => {
            maxes.push(max);

            return queue.shift()!;
          });

          const symbols = indices.map((i) => CERTIFICATE_CODE_ALPHABET[i]).join("");

          expect(code).toBe(`KT-${symbols.slice(0, 4)}-${symbols.slice(4)}`);
          expect(code).toMatch(CODE);
          expect(code).not.toMatch(/[0O1I]/);
          // Always asks for an index over the full 32-symbol alphabet.
          expect(maxes).toEqual(Array(8).fill(32));
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("with the real crypto.randomInt: every code matches the format", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        expect(generateCertificateCode()).toMatch(CODE);
      }),
      { numRuns: 2000 },
    );
  });
});
