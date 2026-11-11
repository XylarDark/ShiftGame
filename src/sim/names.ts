const ADJECTIVES = [
  "Moonlit",
  "Velvet",
  "Cosmic",
  "Sticky",
  "Golden",
  "Foggy",
  "Neon",
  "Sleepy",
  "Zesty",
  "Polar",
  "Ember",
  "Amber",
  "Hazy",
  "Sparkling",
  "Midnight",
];

const NOUNS = [
  "Cheese",
  "Spark",
  "Sherbet",
  "Pebble",
  "Comet",
  "Noodle",
  "Lantern",
  "Biscuit",
  "Thunder",
  "Daisy",
  "Nugget",
  "Drift",
  "Mango",
  "Quilt",
  "Compass",
];

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCustomerName(seed: number): string {
  const rng = mulberry32(seed);
  const first = FIRST[Math.floor(rng() * FIRST.length)]!;
  const last = LAST[Math.floor(rng() * LAST.length)]!;
  return `${first} ${last}`;
}

/**
 * Deliberately unisex. Customer *appearance* is derived from this name via
 * `customerLookIndex`, and the cast varies in gender presentation, so a first name
 * that reads as strongly gendered would sooner or later be printed on an ID card
 * beside a portrait that contradicts it — which players read as a bug rather than
 * as diversity.
 *
 * Keeping the pool neutral is what makes the decoupling safe: there is no gender
 * in the name to disagree with. Adding a strongly gendered given name here would
 * silently break that, so add only names that sit comfortably on anyone.
 */
const FIRST = [
  "Ash",
  "Ren",
  "Milo",
  "Jules",
  "Sable",
  "Ivy",
  "Nico",
  "Wren",
  "Quinn",
  "Rowan",
  "Sol",
  "Pax",
];

const LAST = [
  "Park",
  "Okoye",
  "Voss",
  "Klein",
  "Diaz",
  "Cho",
  "Nguyen",
  "Brooks",
  "Patel",
  "Adeyemi",
  "Lenz",
  "Hart",
];
export function generateNames(count: number, seed: number): string[] {
  const rng = mulberry32(seed);
  const names = new Set<string>();
  let guard = 0;
  while (names.size < count && guard < 500) {
    guard += 1;
    const adj = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)]!;
    const noun = NOUNS[Math.floor(rng() * NOUNS.length)]!;
    names.add(`${adj} ${noun}`);
  }
  return [...names];
}

