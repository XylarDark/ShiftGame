import { describe, expect, it } from "vitest";
import { GameSim } from "./gameSim";
import { nextShopHint, tutorialHints } from "./tutorialHints";

describe("tutorialHints", () => {
  it("points at the walk-in item, then the customer", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    const order = sim.spawnOrder("inStore");
    for (let i = 0; i < 240; i++) {
      if (sim.orderById(order.id)?.arriveAtGameMs !== undefined) break;
      sim.tick(50);
    }
    expect(tutorialHints(sim.snapshot())).toEqual([
      expect.objectContaining({ kind: "item", skuId: order.skuId }),
    ]);
    sim.shopClick({ type: "item", skuId: order.skuId });
    for (let i = 0; i < 240; i++) {
      if (sim.snapshot().handSkuId && sim.snapshot().keyLead.phase === "idle") break;
      sim.tick(50);
    }
    expect(tutorialHints(sim.snapshot())).toEqual([
      expect.objectContaining({ kind: "customer", orderId: order.id }),
    ]);
  });

  it("points at the front ticket, then the item after a pick", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const a = sim.spawnOrder("pickup");
    const b = sim.spawnOrder("delivery", { destinationId: "house-1" });
    const kinds = tutorialHints(sim.snapshot()).map((h) => h.id);
    expect(kinds).toContain(`tablet:${a.id}`);
    expect(kinds).not.toContain(`tablet:${b.id}`);
    sim.shopClick({ type: "tablet", orderId: a.id });
    expect(tutorialHints(sim.snapshot())).toEqual([expect.objectContaining({ kind: "item", skuId: a.skuId })]);
    expect(nextShopHint(sim.snapshot())?.kind).toBe("item");
  });

  it("walks a pickup through tablet, item, then bag", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    sim.shopClick({ type: "tablet", orderId: order.id });
    expect(tutorialHints(sim.snapshot())).toEqual([
      expect.objectContaining({ kind: "item", skuId: order.skuId }),
    ]);
    sim.shopClick({ type: "item", skuId: order.skuId });
    for (let i = 0; i < 240; i++) {
      if (sim.snapshot().handSkuId && sim.snapshot().keyLead.phase === "idle") break;
      sim.tick(50);
    }
    expect(tutorialHints(sim.snapshot()).some((h) => h.kind === "bagRack")).toBe(true);
    sim.shopClick({ type: "bagRack" });
    expect(order.status).toBe("onPickupShelf");
  });

  it("highlights one next click through two deliveries", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const first = sim.spawnOrder("delivery", { destinationId: "house-1" });
    const second = sim.spawnOrder("delivery", { destinationId: "house-2" });
    expect(nextShopHint(sim.snapshot())?.kind).toBe("tablet");

    sim.shopClick({ type: "tablet", orderId: first.id });
    expect(nextShopHint(sim.snapshot())).toEqual(expect.objectContaining({ kind: "item", skuId: first.skuId }));
    expect(sim.snapshot().highlightSkuId).toBe(first.skuId);

    sim.shopClick({ type: "tablet", orderId: second.id });
    expect(nextShopHint(sim.snapshot())).toEqual(expect.objectContaining({ kind: "item", skuId: first.skuId }));

    sim.shopClick({ type: "item", skuId: first.skuId });
    for (let i = 0; i < 240; i++) {
      if (sim.snapshot().handSkuId && sim.snapshot().keyLead.phase === "idle") break;
      sim.tick(50);
    }
    expect(nextShopHint(sim.snapshot())?.kind).toBe("bagRack");
    sim.shopClick({ type: "bagRack" });

    expect(first.status).toBe("inBin");
    expect(nextShopHint(sim.snapshot())).toEqual(expect.objectContaining({ kind: "item", skuId: second.skuId }));
    expect(tutorialHints(sim.snapshot()).map((h) => h.kind)).toEqual(["item"]);
    expect(sim.snapshot().highlightSkuId).toBe(second.skuId);
    expect(sim.snapshot().canHitTheRoad).toBe(true);

    sim.shopClick({ type: "item", skuId: second.skuId });
    for (let i = 0; i < 240; i++) {
      if (sim.snapshot().handSkuId && sim.snapshot().keyLead.phase === "idle") break;
      sim.tick(50);
    }
    expect(nextShopHint(sim.snapshot())?.kind).toBe("bagRack");
    sim.shopClick({ type: "bagRack" });
    expect(second.status).toBe("inBin");
    expect(nextShopHint(sim.snapshot())?.kind).toBe("hitTheRoad");
    expect(tutorialHints(sim.snapshot())).toEqual([expect.objectContaining({ kind: "hitTheRoad" })]);
  });

  it("never returns more than one hint", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    sim.spawnOrder("delivery", { destinationId: "house-1" });
    sim.spawnOrder("delivery", { destinationId: "house-2" });
    expect(tutorialHints(sim.snapshot())).toHaveLength(1);
    expect(tutorialHints(sim.snapshot())[0]?.kind).toBe("tablet");
  });
});
