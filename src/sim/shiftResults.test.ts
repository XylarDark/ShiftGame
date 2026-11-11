import { describe, expect, it } from "vitest";
import {
  SCORE_DELIVERY_LATE,
  SCORE_DELIVERY_ON_TIME,
  SCORE_FAIL,
  SCORE_INSTORE,
  SCORE_PICKUP,
  SHIFT_MS,
} from "./constants";
import type { Order } from "./orders";
import {
  buildShiftResults,
  countShiftBreakdown,
  expectedScoreFromBreakdown,
  shiftVerdict,
} from "./shiftResults";

function order(partial: Partial<Order> & Pick<Order, "id" | "type" | "status">): Order {
  return {
    skuId: "sku-a",
    createdAtGameMs: 0,
    customerName: "Pat",
    idAge: 22,
    idMatches: true,
    ...partial,
  };
}

describe("shiftResults", () => {
  it("counts completes and fails for the breakdown", () => {
    const orders = [
      order({ id: "1", type: "inStore", status: "completed" }),
      order({ id: "2", type: "pickup", status: "completed" }),
      order({ id: "3", type: "delivery", status: "completed", late: false }),
      order({ id: "4", type: "delivery", status: "completed", late: true }),
      order({ id: "5", type: "delivery", status: "failed" }),
      order({ id: "6", type: "pickup", status: "queued" }),
    ];
    const b = countShiftBreakdown(orders);
    expect(b).toEqual({
      inStore: 1,
      pickups: 1,
      deliveriesOnTime: 1,
      deliveriesLate: 1,
      fails: 1,
    });
    expect(expectedScoreFromBreakdown(b)).toBe(
      SCORE_INSTORE + SCORE_PICKUP + SCORE_DELIVERY_ON_TIME + SCORE_DELIVERY_LATE + SCORE_FAIL,
    );
  });

  it("flags an ID review when mismatched-ID handoffs were refused", () => {
    const b = { inStore: 2, pickups: 0, deliveriesOnTime: 1, deliveriesLate: 0, fails: 1 };
    expect(shiftVerdict(b, 1)).toMatch(/ID review/);
    expect(shiftVerdict({ ...b, fails: 0 }, 0)).toMatch(/Clean shift/);
  });

  it("builds a results payload with clock and score", () => {
    const orders = [order({ id: "1", type: "inStore", status: "completed" })];
    const results = buildShiftResults(orders, SCORE_INSTORE, SHIFT_MS, 0);
    expect(results.clockLabel).toBe("23:00");
    expect(results.score).toBe(SCORE_INSTORE);
    expect(results.breakdown.inStore).toBe(1);
    expect(results.title).toMatch(/End of shift|Kindling/);
  });
});
