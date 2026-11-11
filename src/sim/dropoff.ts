import { mismatchedName } from "./names";

export type DropoffPhase = "atCurb" | "calling" | "atDoor";

export interface IdCard {
  /** Name printed on the card. Differs from the order's name when `matches` is false. */
  name: string;
  dob: string;
  /** True when the card's name matches the order, so the handoff can go ahead. */
  matches: boolean;
  age: number;
  /** Printed licence number. Derived from the same identity, so it never shifts. */
  idNumber: string;
  /** Printed expiry. Always in the future — an expired card is not a game rule here. */
  expires: string;
}

export interface DropoffView {
  phase: DropoffPhase | "none";
  orderId: string | null;
  houseId: string | null;
  customerName: string | null;
  /**
   * Index into the customer appearance pool. The doorstep sprite and the ID-card
   * photo both read this one field, so they cannot resolve to different people.
   */
  customerLook: number | null;
  skuName: string | null;
  atCurb: boolean;
  driverOnFoot: boolean;
  driver: { x: number; y: number } | null;
  customer: { x: number; y: number; arrived: boolean } | null;
  photoTaken: boolean;
  idAsked: boolean;
  idChecked: boolean;
  bagHanded: boolean;
  actionLabel: string;
  canAct: boolean;
  hint: string;
  idCard: IdCard | null;
  /** False while the post-step lock is active (blocks click-through after ID). */
  interactArmed: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Youngest age printed on a doorstep ID. Ages only feed the DOB and the look hash. */
export const ID_MIN_AGE = 19;

/** About one doorstep in this many shows an ID whose name doesn't match the order. */
export const ID_MISMATCH_ONE_IN = 4;

export function emptyDropoff(): DropoffView {
  return {
    phase: "none",
    orderId: null,
    houseId: null,
    customerName: null,
    customerLook: null,
    skuName: null,
    atCurb: false,
    driverOnFoot: false,
    driver: null,
    customer: null,
    photoTaken: false,
    idAsked: false,
    idChecked: false,
    bagHanded: false,
    actionLabel: "",
    canAct: false,
    hint: "",
    idCard: null,
    interactArmed: true,
  };
}

/** Stable 32-bit hash so the same order always gets the same ID. */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Printed age for a customer's ID. Same seed always yields the same age. */
export function ageForSeed(seed: string): number {
  const h = hashSeed(seed);
  return ID_MIN_AGE + (h % 28);
}

/**
 * Whether the customer's ID will match the order: about 1 in 4 doorsteps show a
 * card with someone else's surname, and the courier has to refuse the handoff.
 * Same seed always yields the same answer.
 */
export function idMatchesForSeed(seed: string): boolean {
  return hashSeed(seed) % ID_MISMATCH_ONE_IN !== 0;
}

export function idCardFor(name: string, ageOrSeed: number | string, matches = true): IdCard {
  const age = typeof ageOrSeed === "number" ? ageOrSeed : ageForSeed(`${ageOrSeed}:${name}`);
  const h = hashSeed(`${name}:${age}`);
  const year = 2026 - age;
  const day = 1 + (h % 28);
  const month = MONTHS[(h >>> 8) % 12]!;
  return {
    name: matches ? name : mismatchedName(name, h),
    dob: `${day} ${month} ${year}`,
    matches,
    age,
    idNumber: licenceNumber(h),
    expires: `${day} ${month} ${2027 + ((h >>> 16) % 5)}`,
  };
}

/**
 * Two letters and seven digits, grouped the way a licence is. Taken from the same
 * hash as the date of birth, so re-deriving a card never changes the number on it.
 */
function licenceNumber(h: number): string {
  const letters = "ABCDEFGHJKLMNPRSTVWXYZ";
  const a = letters[h % letters.length]!;
  const b = letters[(h >>> 5) % letters.length]!;
  const digits = String(100000 + ((h >>> 3) % 900000));
  return `${a}${b} ${digits.slice(0, 3)} ${digits.slice(3)}${(h >>> 11) % 10}`;
}
