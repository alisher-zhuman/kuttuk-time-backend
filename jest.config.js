// Unit tests: src/**/*.spec.ts, no DB/Docker, run in parallel.
/** @type {import('jest').Config} */
module.exports = {
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  moduleFileExtensions: ["js", "json", "ts"],
  transform: { "^.+\\.ts$": "ts-jest" },
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  testEnvironment: "node",
};
