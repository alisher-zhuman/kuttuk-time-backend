import { validateSync } from "class-validator";

import { IsOptionalNotNull, IsTranslations, isTranslations } from "./validators";

describe("isTranslations", () => {
  it("accepts exactly ru/kg/en with non-empty strings", () => {
    expect(isTranslations({ ru: "Кофе", kg: "Кофе", en: "Coffee" })).toBe(true);
    expect(isTranslations({ en: "Coffee", ru: "Кофе", kg: "Кофе" })).toBe(true);
  });

  it.each([
    ["a missing language", { ru: "Кофе", kg: "Кофе" }],
    ["an extra key", { ru: "Кофе", kg: "Кофе", en: "Coffee", de: "Kaffee" }],
    ["a wrong key instead of one", { ru: "Кофе", kg: "Кофе", ky: "Кофе" }],
    ["an empty string", { ru: "Кофе", kg: "", en: "Coffee" }],
    ["a blank string", { ru: "Кофе", kg: "   ", en: "Coffee" }],
    ["a non-string value", { ru: "Кофе", kg: 1, en: "Coffee" }],
    ["a null value", { ru: "Кофе", kg: null, en: "Coffee" }],
    ["null", null],
    ["an array", ["ru", "kg", "en"]],
    ["a string", "Coffee"],
    ["an empty object", {}],
  ])("rejects %s", (_name, value) => {
    expect(isTranslations(value)).toBe(false);
  });
});

describe("IsOptionalNotNull", () => {
  class Dto {
    @IsOptionalNotNull()
    @IsTranslations()
    name?: unknown;
  }

  const errors = (name: unknown) => {
    const dto = new Dto();

    if (name !== "omit") {
      dto.name = name;
    }

    return validateSync(dto).length;
  };

  it("skips validation when the field is omitted", () => {
    expect(errors("omit")).toBe(0);
  });

  it("rejects null (unlike @IsOptional)", () => {
    expect(errors(null)).toBe(1);
  });

  it("validates a present value", () => {
    expect(errors({ ru: "a", kg: "b", en: "c" })).toBe(0);
    expect(errors({ ru: "a" })).toBe(1);
  });
});
