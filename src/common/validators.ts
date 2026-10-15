import { registerDecorator, ValidateIf, type ValidationOptions } from "class-validator";

import { LANGUAGES } from "./translations";

// Exactly the keys ru/kg/en — no missing, no extra — each a non-empty (non-blank) string.
export const isTranslations = (value: unknown): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    Object.keys(record).length === LANGUAGES.length &&
    LANGUAGES.every((lang) => typeof record[lang] === "string" && record[lang].trim() !== "")
  );
};

export const IsTranslations =
  (options?: ValidationOptions): PropertyDecorator =>
  (target, propertyName) =>
    registerDecorator({
      name: "isTranslations",
      target: target.constructor,
      propertyName: String(propertyName),
      options: {
        message: `$property must have exactly the keys ${LANGUAGES.join(", ")}, each a non-empty string`,
        ...options,
      },
      validator: { validate: isTranslations },
    });

// For PATCH fields: may be omitted, but not null. @IsOptional() also lets null through,
// which then hits a NOT NULL column as a 500 instead of a 400.
export const IsOptionalNotNull = (): PropertyDecorator =>
  ValidateIf((_object, value) => value !== undefined);
