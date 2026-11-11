import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCatalog } from "../sim/catalog";

/** Every shipped source file (tests excluded), so player copy can't drift back. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.ts$/.test(entry) && !/\.test\.ts$/.test(entry) ? [path] : [];
  });
}

describe("generic retail theme", () => {
  const files = sourceFiles(join(__dirname, ".."));

  it("scans the shipped sources", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("ships no age-gate or cannabis copy", () => {
    const banned = /\b19\+|under[- ]?19|licence risk|compliance hold|cannabis|dispensar|\bstrains?\b|pre-?roll|\bedibles?\b/i;
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(banned);
    }
  });

  it("names shelf items from a neutral pool", () => {
    const weedCoded = /hazy|sticky|nugget|kush|cheese|sherbet|haze|bud\b/i;
    for (let seed = 0; seed < 50; seed++) {
      for (const sku of createCatalog(seed)) expect(sku.name).not.toMatch(weedCoded);
    }
  });
});
