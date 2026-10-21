import {
  formatCertificateCode,
  generateCertificateCode,
  normalizeCertificateCode,
} from "./certificate-code";

describe("generateCertificateCode", () => {
  const codes = Array.from({ length: 5000 }, () => generateCertificateCode());

  it("is 8 digits", () => {
    for (const code of codes) {
      expect(code).toMatch(/^[0-9]{8}$/);
    }
  });

  it("uses every digit in every position (randomInt covers the whole range)", () => {
    for (let position = 0; position < 8; position++) {
      expect(new Set(codes.map((code) => code[position])).size).toBe(10);
    }
  });

  it("keeps leading zeros (a string, not a number)", () => {
    expect(generateCertificateCode(() => 0)).toBe("00000000");
  });

  it("does not repeat on a sample of 5000", () => {
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("normalizeCertificateCode", () => {
  it.each([
    ["04718263", "04718263"],
    ["0471 8263", "04718263"],
    ["0471-8263", "04718263"],
    ["  0471  8263 ", "04718263"],
    ["0 4 7 1 8 2 6 3", "04718263"],
  ])("%p → %p", (input, expected) => {
    expect(normalizeCertificateCode(input)).toBe(expected);
  });

  it.each([
    "",
    "0471826",
    "047182634",
    "0471 826a",
    "KT-ABCD-2345", // the old format is gone (2026-10-21)
    "0471_8263",
    "٠٤٧١٨٢٦٣", // non-ASCII digits
  ])("rejects %p", (input) => {
    expect(normalizeCertificateCode(input)).toBeNull();
  });
});

describe("formatCertificateCode", () => {
  it("groups 4 + 4", () => {
    expect(formatCertificateCode("04718263")).toBe("0471 8263");
  });
});
