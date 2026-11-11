import { describe, expect, it } from "vitest";
import {
  MS_PER_GAME_HOUR,
  SCORE_DELIVERY_LATE,
  SCORE_DELIVERY_ON_TIME,
  SCORE_FAIL,
  SCORE_INSTORE,
  SCORE_PICKUP,
} from "./constants";
import type { Order } from "./orders";
import { isDeliveryLate, scoreForComplete, scoreForFail } from "./scoring";

function order(partial: Partial<Order> & Pick<Order, "type">): Order {
  return {
    id: "ord-1",
    skuId: "sku-1",
    status: "onRun",
    createdAtGameMs: 0,
    customerName: "Ash Park",
    idAge: 24,
    idMatches: true,
    ...partial,
  };
}

describe("scoring", () => {
  it("scores in-store and pickup completes", () => {
    expect(scoreForComplete(order({ type: "inStore" }), 0)).toBe(SCORE_INSTORE);
    expect(scoreForComplete(order({ type: "pickup" }), 0)).toBe(SCORE_PICKUP);
  });

  it("scores on-time vs late delivery", () => {
    const delivery = order({ type: "delivery", slaStartGameMs: 0 });
    expect(isDeliveryLate(delivery, MS_PER_GAME_HOUR - 1)).toBe(false);
    expect(scoreForComplete(delivery, MS_PER_GAME_HOUR - 1)).toBe(SCORE_DELIVERY_ON_TIME);
    expect(isDeliveryLate(delivery, MS_PER_GAME_HOUR + 1)).toBe(true);
    expect(scoreForComplete(delivery, MS_PER_GAME_HOUR + 1)).toBe(SCORE_DELIVERY_LATE);
  });

  it("scores walkout / no-show", () => {
    expect(scoreForFail()).toBe(SCORE_FAIL);
  });
});
