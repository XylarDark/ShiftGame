import { describe, expect, it } from "vitest";
import { CITY, MAP_COLS, MAP_ROWS } from "../maps/cityT0";
import { destLabel, isPackedOnCounter, needsFetch, type Order } from "./orders";

describe("orders helpers", () => {
  it("treats queued and at-register as needing a fetch", () => {
    const queued: Order = {
      id: "a",
      type: "pickup",
      skuId: "s",
      status: "queued",
      createdAtGameMs: 0,
      customerName: "Ren Voss",
      idAge: 24,
      idMatches: true,
    };
    const ringing: Order = { ...queued, id: "b", type: "inStore", status: "atRegister" };
    expect(needsFetch(queued)).toBe(true);
    expect(needsFetch(ringing)).toBe(true);
    expect(needsFetch({ ...queued, status: "inBin" })).toBe(false);
    expect(isPackedOnCounter({ ...queued, status: "onPickupShelf" })).toBe(true);
    expect(isPackedOnCounter({ ...queued, status: "inBin" })).toBe(true);
    expect(isPackedOnCounter(queued)).toBe(false);
  });

  it("labels counter vs house destinations", () => {
    const base: Order = {
      id: "a",
      type: "inStore",
      skuId: "s",
      status: "atRegister",
      createdAtGameMs: 0,
      customerName: "Ren Voss",
      idAge: 24,
      idMatches: true,
    };
    expect(destLabel(base)).toBe("Counter");
    expect(destLabel({ ...base, type: "pickup" })).toBe("Pickup");
    expect(destLabel({ ...base, type: "delivery", destinationId: "house-7" })).toBe("House 7");
  });
});

describe("city map", () => {
  it("is a rectangular neighborhood grid", () => {
    expect(CITY.kinds).toHaveLength(MAP_ROWS);
    expect(CITY.kinds[0]).toHaveLength(MAP_COLS);
    expect(MAP_COLS).toBeGreaterThan(20);
    expect(CITY.houses.length).toBeGreaterThanOrEqual(12);
  });
});
