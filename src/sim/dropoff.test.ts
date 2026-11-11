import { describe, expect, it } from "vitest";
import { ageForSeed, ID_MIN_AGE, idCardFor, idMatchesForSeed } from "./dropoff";

describe("idCardFor", () => {
  it("prints the order's name on a matching card", () => {
    const card = idCardFor("Ash Park", 19);
    expect(card.matches).toBe(true);
    expect(card.age).toBe(19);
    expect(card.name).toBe("Ash Park");
    expect(card.dob).toMatch(/\d+ \w+ \d{4}/);
  });

  it("prints a different surname on a mismatched card, so it is a deny", () => {
    const card = idCardFor("Ren Voss", 27, false);
    expect(card.matches).toBe(false);
    expect(card.name).not.toBe("Ren Voss");
    expect(card.name.startsWith("Ren ")).toBe(true);
    expect(card.dob).toContain(String(2026 - 27));
  });

  it("is stable for the same name, age and match", () => {
    expect(idCardFor("Milo Cho", 24)).toEqual(idCardFor("Milo Cho", 24));
    expect(idCardFor("Milo Cho", 24, false)).toEqual(idCardFor("Milo Cho", 24, false));
  });

  it("never prints an age below the ID minimum", () => {
    for (let i = 0; i < 200; i++) expect(ageForSeed(`ord-${i}:Patel`)).toBeGreaterThanOrEqual(ID_MIN_AGE);
    expect(ageForSeed("ord-3:Patel")).toBe(ageForSeed("ord-3:Patel"));
  });

  it("seeds some doorsteps with a matching ID and some without", () => {
    const matches = Array.from({ length: 24 }, (_, i) => idMatchesForSeed(`ord-${i}:Patel`));
    expect(matches.some(Boolean)).toBe(true);
    expect(matches.some((m) => !m)).toBe(true);
    expect(idMatchesForSeed("ord-3:Patel")).toBe(idMatchesForSeed("ord-3:Patel"));
  });
});
