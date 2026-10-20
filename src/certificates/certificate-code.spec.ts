import {
  CERTIFICATE_CODE_ALPHABET,
  generateCertificateCode,
  normalizeCertificateCode,
} from "./certificate-code";

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

describe("normalizeCertificateCode", () => {
  it.each([
    ["KT-ABCD-2345", "KT-ABCD-2345"],
    ["kt-abcd-2345", "KT-ABCD-2345"],
    ["  KT ABCD 2345 ", "KT-ABCD-2345"],
    ["ABCD2345", "KT-ABCD-2345"],
    ["abcd-2345", "KT-ABCD-2345"],
    ["KTABCD2345", "KT-ABCD-2345"],
    // A body that itself starts with KT: 8 chars → no prefix to strip.
    ["KTAB2345", "KT-KTAB-2345"],
    ["KT-KTAB-2345", "KT-KTAB-2345"],
    // Russian keyboard: Cyrillic К Т А В С Е Н Р М Х look exactly like Latin.
    ["кт-авсе-2345", "KT-ABCE-2345"],
    ["КТ-НРМХ-2345", "KT-HPMX-2345"],
    ["Кт-Abce-2345", "KT-ABCE-2345"],
  ])("%p → %p", (input, expected) => {
    expect(normalizeCertificateCode(input)).toBe(expected);
  });

  it.each([
    "",
    "KT-ABCD",
    "KT-ABCD-23456",
    "KT-ABC0-2345",
    "KT-ABCO-2345",
    "KT-ABC1-2345",
    "KT-ABCI-2345",
    "XX-ABCD-2345",
    "KT_ABCD_2345",
    "кт-абвг-2345", // б, г have no Latin look-alike
  ])("rejects %p", (input) => {
    expect(normalizeCertificateCode(input)).toBeNull();
  });

  it("is idempotent on every generated code", () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateCertificateCode();

      expect(normalizeCertificateCode(code)).toBe(code);
      expect(normalizeCertificateCode(code.toLowerCase().replace(/-/g, " "))).toBe(code);
    }
  });
});
