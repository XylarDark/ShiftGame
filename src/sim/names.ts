/**
 * Shop item names are "Adjective Noun" pairs drawn from a neutral
 * gift-and-general-store shelf (kettles, candles, quilts, puzzles).
 */
const ADJECTIVES = [
  "Moonlit",
  "Velvet",
  "Cosmic",
  "Maple",
  "Golden",
  "Harbor",
  "Neon",
  "Cozy",
  "Sunny",
  "Polar",
  "Ember",
  "Amber",
  "Crisp",
  "Sparkling",
  "Midnight",
];

const NOUNS = [
  "Kettle",
  "Spark",
  "Candle",
  "Pebble",
  "Comet",
  "Noodle",
  "Lantern",
  "Biscuit",
  "Teapot",
  "Daisy",
  "Blanket",
  "Puzzle",
  "Mitten",
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
/**
 * The same first name with a different surname, for an ID that doesn't match its
 * order. Deterministic in `h`, and never returns the original name.
 */
export function mismatchedName(name: string, h: number): string {
  const [first, ...rest] = name.split(" ");
  const last = rest.join(" ");
  let pick = LAST[h % LAST.length]!;
  if (pick === last) pick = LAST[(h + 1) % LAST.length]!;
  return `${first} ${pick}`;
}

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

