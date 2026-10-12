// Integration tests: test/**/*.int-spec.ts against a real Postgres.
// A separate config (not Jest `projects`) because these must run in a single worker —
// tests share one database and are isolated by TRUNCATE — while `maxWorkers` is global in Jest.
/** @type {import('jest').Config} */
module.exports = {
  rootDir: ".",
  roots: ["<rootDir>/test"],
  testRegex: ".*\\.int-spec\\.ts$",
  moduleFileExtensions: ["js", "json", "ts"],
  transform: { "^.+\\.ts$": "ts-jest" },
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  testEnvironment: "node",
  globalSetup: "<rootDir>/test/global-setup.ts",
  globalTeardown: "<rootDir>/test/global-teardown.ts",
  maxWorkers: 1,
  testTimeout: 30_000,
};
