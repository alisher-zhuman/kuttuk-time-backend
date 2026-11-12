// @ts-check
// ESLint flat config (ESLint 10 dropped .eslintrc) - the setup typescript-eslint recommends:
// https://typescript-eslint.io/getting-started/
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist/", "node_modules/", "coverage/", "reports/"] },
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      curly: ["error", "all"],
    },
  },
);
