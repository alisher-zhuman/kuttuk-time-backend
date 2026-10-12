import { CERTIFICATE_CODE_ALPHABET, generateCertificateCode } from "./certificate-code";

describe("generateCertificateCode", () => {
  const codes = Array.from({ length: 5000 }, generateCertificateCode);

  it("uses a 32-symbol alphabet without 0, O, 1, I and no duplicates", () => {
    expect(CERTIFICATE_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(CERTIFICATE_CODE_ALPHABET).size).toBe(32);
    expect(CERTIFICATE_CODE_ALPHABET).not.toMatch(/[0O1I]/);
  });

  it("matches KT-XXXX-XXXX", () => {
    for (const code of codes) {
      expect(code).toMatch(/^KT-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    }
  });

  it("never contains 0, O, 1 or I in the random part", () => {
    expect(codes.map((code) => code.slice(3)).join("")).not.toMatch(/[0O1I]/);
  });

  it("uses every alphabet symbol (randomInt covers the whole range)", () => {
    const seen = new Set(codes.flatMap((code) => code.slice(3).replace("-", "").split("")));

    expect([...seen].sort().join("")).toBe([...CERTIFICATE_CODE_ALPHABET].sort().join(""));
  });

  it("does not repeat on a sample of 5000", () => {
    expect(new Set(codes).size).toBe(codes.length);
  });
});
