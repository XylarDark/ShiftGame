import { describe, expect, it } from "vitest";
import { MS_PER_GAME_HOUR, MS_PER_GAME_MINUTE } from "../sim/constants";
import {
  HOURS,
  HOWTO_HINT,
  HOWTO_STEPS,
  MARK,
  PAUSE_HINT,
  WELCOME_HINT,
  WELCOME_TITLE,
  driverReadyCopy,
  formatSlaClock,
  interactButtonCopy,
  isSlaUrgent,
  receiptOverflowLine,
  receiptSlipLine,
} from "./copy";

describe("shop copy", () => {
  it("keeps the mark in tracked caps and hours in title case", () => {
    expect(MARK).toBe("SHIFT");
    expect(HOURS).toBe("Open\n9 AM – 11 PM");
    expect(WELCOME_TITLE).toBe("Welcome to Shift");
    expect(WELCOME_HINT).toMatch(/key-lead|tap to begin/i);
    expect(PAUSE_HINT.startsWith("Paused")).toBe(true);
    expect(HOWTO_HINT.startsWith("Tap")).toBe(true);
    expect(HOWTO_STEPS).toHaveLength(3);
    expect(HOWTO_STEPS[2]?.body).toMatch(/ASK ID/i);
  });

  it("prompts the driver to leave or wait for another bag", () => {
    expect(driverReadyCopy(1)).toContain("wait for another delivery");
    expect(driverReadyCopy(2)).toContain("2 packed bags");
    expect(interactButtonCopy("PHOTO")?.caption).toContain("photo");
    expect(interactButtonCopy("ASK ID")?.label).toBe("ASK FOR ID");
    expect(interactButtonCopy("CHECK ID")?.caption).toContain("ID card");
    expect(interactButtonCopy("CALL")).toBeNull();
  });

  it("formats the one-hour delivery SLA next to the bag name", () => {
    expect(formatSlaClock(null)).toBe("");
    expect(formatSlaClock(MS_PER_GAME_HOUR)).toBe("60m");
    expect(formatSlaClock(47 * MS_PER_GAME_MINUTE)).toBe("47m");
    expect(formatSlaClock(9 * MS_PER_GAME_MINUTE)).toBe("9m");
    expect(formatSlaClock(0)).toBe("LATE");
    expect(formatSlaClock(-200)).toBe("LATE");
    expect(isSlaUrgent(11 * MS_PER_GAME_MINUTE)).toBe(false);
    expect(isSlaUrgent(10 * MS_PER_GAME_MINUTE)).toBe(true);
    expect(isSlaUrgent(-1)).toBe(true);
  });

  it("prints one-line receipt slips", () => {
    expect(receiptSlipLine("House 1", "Ash Park", 47 * MS_PER_GAME_MINUTE)).toBe("House 1  ·  Ash Park  ·  47m");
    expect(receiptSlipLine("House 1", "Ash Park", 0)).toBe("House 1  ·  Ash Park  ·  LATE");
    expect(receiptSlipLine("Pickup", "Ash Park", null)).toBe("Pickup  ·  Ash Park");
    // One line only — the rail gives each slip a single row.
    expect(receiptSlipLine("House 1", "Ash Park", 0)).not.toContain("\n");
    expect(receiptOverflowLine(2)).toBe("+2 more");
  });
});
