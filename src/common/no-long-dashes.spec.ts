import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Project rule (2026-11-10): only the plain hyphen "-", never the em dash (U+2014) or the en dash
// (U+2013) - in bot texts, code, comments, tests and docs alike. Fails on the first one that
// sneaks back.
const ROOT = join(__dirname, "..", "..");
const SKIP = new Set(["node_modules", "dist", "coverage", "reports", ".git"]);
const TEXT = /\.(ts|js|json|md|ya?ml|example)$/;
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name) || name === "package-lock.json") {
      return [];
    }

    const path = join(dir, name);

    return statSync(path).isDirectory() ? files(path) : TEXT.test(name) ? [path] : [];
  });

describe("no long dashes", () => {
  it("only the plain hyphen anywhere in the project", () => {
    const offenders = files(ROOT).flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .flatMap((line, i) => (DASHES.test(line) ? [`${relative(ROOT, path)}:${i + 1}`] : [])),
    );

    expect(offenders).toEqual([]);
  });
});
