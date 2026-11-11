import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CALL_CONNECT_MS,
  INSTORE_WALKOUT_MS,
  MS_PER_GAME_HOUR,
  NPC_INTERACT_COOLDOWN_MS,
  PICKUP_ARRIVE_MS,
  PICKUP_HANDOFF_WAIT_MS,
  SCORE_DELIVERY_LATE,
  SCORE_DELIVERY_ON_TIME,
  SCORE_FAIL,
  SCORE_INSTORE,
  SCORE_PICKUP,
  SHIFT_MS,
} from "./constants";
import { GameSim } from "./gameSim";
import { tutorialHints } from "./tutorialHints";
import { CITY, houseById, isEWStreet, isNSStreet, lotCenter, tileToWorld } from "../maps/cityT0";
import { PERSON_DISPLAY_W } from "../maps/shopT0";
import { angleDelta, driveLaneCell, kerbParkHeading } from "./driveRoute";
import { PARK_TURN_RATE } from "./constants";
import {
  TRAFFIC_LANE_WIDTH,
  TRAFFIC_LOOK_AHEAD,
  TRAFFIC_MIN_SEP,
  VAN_MATCH_GAP,
  cityTrafficLoops,
  trafficCars,
} from "../maps/traffic";
import {
  OPENING_FIRST_AT_MS,
  OPENING_ORDER_GAP_MS,
  TICKET_WAVE_GAP_SCALE,
  TICKET_WAVE_MAX_MS,
  TICKET_WAVE_MIN_MS,
  WALKIN_GAP_MAX_MS,
  WALKIN_GAP_MIN_MS,
} from "./constants";

function stepDropoff(sim: GameSim): void {
  sim.interact();
  sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
}

function finishDropoff(sim: GameSim, houseId: string): void {
  const stop = houseById(houseId)!;
  const pos = tileToWorld(stop.stop);
  sim.setVehiclePosition(pos.x, pos.y);
  sim.tick(32);
  stepDropoff(sim); // call
  sim.tick(CALL_CONNECT_MS + 32);
  stepDropoff(sim); // ask ID
  stepDropoff(sim); // check ID
  stepDropoff(sim); // hand bag
  stepDropoff(sim); // photo
}

function startDoor(sim: GameSim, houseId: string): void {
  const stop = houseById(houseId)!;
  const pos = tileToWorld(stop.stop);
  sim.setVehiclePosition(pos.x, pos.y);
  sim.tick(32);
  stepDropoff(sim);
  sim.tick(CALL_CONNECT_MS + 32);
}

function waitForFetch(sim: GameSim): void {
  for (let i = 0; i < 240; i++) {
    const snap = sim.snapshot();
    if (snap.handSkuId && snap.keyLead.phase === "idle") return;
    sim.tick(50);
  }
}

function waitForCustomerAtCounter(sim: GameSim, orderId: string): void {
  for (let i = 0; i < 240; i++) {
    if (sim.orderById(orderId)?.arriveAtGameMs !== undefined) return;
    sim.tick(50);
  }
}

/**
 * Let the key lead work the counter while the van is out. Coarse 50ms ticks and an early
 * exit keep these well clear of vitest's default timeout — never tighten the granularity.
 */
function runCover(sim: GameSim, done: () => boolean, maxTicks = 600): void {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return;
    sim.tick(50);
  }
}

function fillTicket(
  sim: GameSim,
  type: "pickup" | "inStore" | "delivery",
  extra?: { destinationId?: string; skuId?: string; idMatches?: boolean },
) {
  const order = sim.spawnOrder(type, { ...extra, idMatches: extra?.idMatches ?? true });
  if (type === "inStore") {
    waitForCustomerAtCounter(sim, order.id);
    sim.shopClick({ type: "item", skuId: order.skuId });
    waitForFetch(sim);
    sim.shopClick({ type: "customer", orderId: order.id });
    return order;
  }
  sim.shopClick({ type: "tablet", orderId: order.id });
  sim.shopClick({ type: "item", skuId: order.skuId });
  waitForFetch(sim);
  sim.shopClick({ type: "bagRack" });
  return order;
}

describe("GameSim order loops", () => {
  it("archives terminal orders off the hot list without losing shift breakdown", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    for (let i = 0; i < 8; i++) {
      const order = fillTicket(sim, "inStore");
      expect(sim.orderById(order.id)?.status).toBe("completed");
    }
    expect(sim.activeOrderCount()).toBe(0);
    expect(sim.endShiftEarly()).toBe(true);
    expect(sim.snapshot().shiftResults!.breakdown.inStore).toBe(8);
  });

  it("patches snapshot in place on tick; rebuilds after touch()", () => {
    const sim = GameSim.create({ seed: 3, autoSpawn: false });
    const a = sim.snapshot();
    const b = sim.snapshot();
    expect(a).toBe(b);
    const beforeMs = a.gameMs;
    expect(sim.gameMs()).toBe(beforeMs);
    expect(sim.isAutoDriving()).toBe(false);
    sim.tick(16);
    const c = sim.snapshot();
    expect(c).toBe(a);
    expect(c.gameMs).toBeGreaterThan(beforeMs);
    const d = sim.snapshot();
    expect(d).toBe(c);
    sim.shopClick({ type: "keyLead" });
    const e = sim.snapshot();
    expect(e).not.toBe(a);
  });

  it("completes pickup: bag, item, counter, arrive, handoff", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = fillTicket(sim, "pickup");
    expect(order.status).toBe("onPickupShelf");
    sim.tick(PICKUP_ARRIVE_MS);
    expect(sim.orderById(order.id)?.status).toBe("readyForHandoff");
    sim.tick(4000);
    sim.shopClick({ type: "handoff" });
    expect(sim.orderById(order.id)?.status).toBe("completed");
    expect(sim.score).toBe(SCORE_PICKUP);
  });

  it("completes pickup when the waiting customer is tapped", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = fillTicket(sim, "pickup");
    sim.tick(PICKUP_ARRIVE_MS);
    expect(sim.orderById(order.id)?.status).toBe("readyForHandoff");
    sim.tick(4000);
    const atCounter = sim.snapshot().customers.find((c) => c.orderId === order.id);
    expect(atCounter?.bubble).toBe("Tap me — pickup");
    // Arrival must not stack a near-identical feedback chip under the bubble.
    expect(atCounter?.feedback ?? "").toBe("");
    sim.shopClick({ type: "customer", orderId: order.id });
    expect(sim.orderById(order.id)?.status).toBe("completed");
    expect(sim.score).toBe(SCORE_PICKUP);
  });

  it("fails pickup as a no-show if nobody hands it off", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = fillTicket(sim, "pickup");
    sim.tick(PICKUP_ARRIVE_MS);
    waitForCustomerAtCounter(sim, order.id);
    sim.tick(PICKUP_HANDOFF_WAIT_MS + 16);
    expect(sim.orderById(order.id)?.status).toBe("failed");
    expect(sim.score).toBe(SCORE_FAIL);
  });

  /**
   * The reported case: a walk-in and a pickup waiting on their handoff both stood on the
   * one counter spot, drawing as a single silhouette with two heads. Both customer paths
   * — `spawnOrder("inStore")` and the pickup that arrives on the shelf — have to take
   * standing room of their own, and hold it while their neighbours come and go.
   */
  it("stands every customer on the floor in room of their own", () => {
    const sim = GameSim.create({ seed: 3, autoSpawn: false });
    const pickup = fillTicket(sim, "pickup");
    sim.tick(PICKUP_ARRIVE_MS);
    const walkIn = sim.spawnOrder("inStore");
    // Both settled. Everyone comes in by the one door, so two customers still crossing
    // the floor legitimately pass each other — it is where they *stand* that is at issue.
    waitForCustomerAtCounter(sim, walkIn.id);
    waitForCustomerAtCounter(sim, pickup.id);

    const floor = sim.snapshot().customers;
    expect(floor.map((c) => c.orderId).sort()).toEqual([pickup.id, walkIn.id].sort());
    expect(new Set(floor.map((c) => c.slot)).size).toBe(2);
    const [a, b] = floor.map((c) => c.x);
    expect(Math.abs(a! - b!), "shoulder to shoulder at least").toBeGreaterThanOrEqual(PERSON_DISPLAY_W);

    // Whoever is left keeps the spot they walked to: being served ahead of you must not
    // drag you sideways across the lobby.
    // Tapping the pickup by name, not `handoff` — that serves the walk-in first.
    const kept = sim.snapshot().customers.find((c) => c.orderId === walkIn.id)!;
    sim.shopClick({ type: "customer", orderId: pickup.id });
    expect(sim.orderById(pickup.id)?.status).toBe("completed");
    const after = sim.snapshot().customers;
    expect(after).toHaveLength(1);
    expect(after[0]!.slot).toBe(kept.slot);
    expect(after[0]!.x).toBe(kept.x);
  });

  it("completes in-store serve and penalizes walkout", () => {
    const served = GameSim.create({ seed: 2, autoSpawn: false });
    fillTicket(served, "inStore");
    expect(served.score).toBe(SCORE_INSTORE);

    const walked = GameSim.create({ seed: 2, autoSpawn: false });
    const order = walked.spawnOrder("inStore");
    walked.tick(4000);
    walked.tick(INSTORE_WALKOUT_MS);
    expect(walked.orderById(order.id)?.status).toBe("failed");
    expect(walked.score).toBe(SCORE_FAIL);
  });

  it("does not finish a walk-in until the item is handed to them", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    const order = sim.spawnOrder("inStore");
    const other = sim.catalog.find((s) => s.id !== order.skuId)!;
    sim.shopClick({ type: "item", skuId: other.id });
    expect(sim.orderById(order.id)?.status).toBe("atRegister");
    expect(sim.score).toBe(0);
    waitForCustomerAtCounter(sim, order.id);
    sim.shopClick({ type: "item", skuId: other.id });
    sim.shopClick({ type: "customer", orderId: order.id });
    expect(sim.orderById(order.id)?.status).toBe("atRegister");
    expect(sim.score).toBe(0);
    sim.shopClick({ type: "item", skuId: order.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().serveLine).toContain("HANDOFF");
    expect(sim.orderById(order.id)?.status).toBe("atRegister");
    sim.shopClick({ type: "customer", orderId: order.id });
    expect(sim.orderById(order.id)?.status).toBe("completed");
    expect(sim.score).toBe(SCORE_INSTORE);
  });

  it("blocks walk-in TV taps until the customer reaches the counter", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    const order = sim.spawnOrder("inStore");
    sim.shopClick({ type: "item", skuId: order.skuId });
    expect(sim.snapshot().handSkuId).toBeNull();
    expect(sim.snapshot().customers.find((c) => c.orderId === order.id)?.feedback).toContain("walking in");
    waitForCustomerAtCounter(sim, order.id);
    sim.shopClick({ type: "item", skuId: order.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().handSkuId).toBe(order.skuId);
  });

  it("blocks pickup handoff until the customer reaches the counter", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = fillTicket(sim, "pickup");
    sim.tick(PICKUP_ARRIVE_MS);
    sim.shopClick({ type: "customer", orderId: order.id });
    expect(sim.orderById(order.id)?.status).toBe("readyForHandoff");
    waitForCustomerAtCounter(sim, order.id);
    sim.shopClick({ type: "customer", orderId: order.id });
    expect(sim.orderById(order.id)?.status).toBe("completed");
  });

  it("starts delivery SLA when the named bag is filled, not when leaving", () => {
    const sim = GameSim.create({ seed: 3, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1" });
    expect(order.status).toBe("inBin");
    expect(order.customerName.length).toBeGreaterThan(2);
    expect(sim.snapshot().orders[0]?.destLabel).toBe("House 1");
    expect(order.slaStartGameMs).toBe(sim.clock.gameMs);
    const packed = sim.snapshot().orders.find((o) => o.id === order.id)!;
    expect(packed.slaRemainingMs).toBeGreaterThan(MS_PER_GAME_HOUR - 50);
    expect(packed.slaRemainingMs).toBeLessThanOrEqual(MS_PER_GAME_HOUR);
    expect(packed.late).toBe(false);
    sim.tick(1000);
    expect(sim.hitTheRoad()).toBe(true);
    expect(sim.orderById(order.id)?.slaStartGameMs).toBe(order.slaStartGameMs);
    const afterTick = sim.snapshot().orders.find((o) => o.id === order.id)!;
    expect(afterTick.slaRemainingMs).toBeCloseTo(MS_PER_GAME_HOUR - 1000, -2);
    expect(afterTick.status).toBe("onRun");
  });

  it("keeps a packed delivery bag after the one-hour SLA expires", () => {
    const sim = GameSim.create({ seed: 3, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.tick(MS_PER_GAME_HOUR + 50);
    const view = sim.snapshot().orders.find((o) => o.id === order.id)!;
    expect(view.status).toBe("inBin");
    expect(view.slaRemainingMs).toBeLessThanOrEqual(0);
    expect(view.late).toBe(true);
  });

  it("packs after tablet, item, then bag — no receipt click", () => {
    const sim = GameSim.create({ seed: 8, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    sim.shopClick({ type: "tablet", orderId: order.id });
    expect(sim.snapshot().highlightSkuId).toBe(order.skuId);
    expect(sim.snapshot().awaitingBag).toBe(false);
    sim.shopClick({ type: "item", skuId: order.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().awaitingBag).toBe(true);
    expect(sim.snapshot().highlightSkuId).toBeNull();
    expect(order.status).toBe("queued");
    sim.shopClick({ type: "bagRack" });
    expect(order.status).toBe("onPickupShelf");
  });

  it("lets a wrong wall TV stay unfetched until the right one is tapped", () => {
    const sim = GameSim.create({ seed: 8, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    const other = sim.catalog.find((s) => s.id !== order.skuId)!;
    sim.shopClick({ type: "tablet", orderId: order.id });
    sim.shopClick({ type: "item", skuId: other.id });
    expect(sim.snapshot().handSkuId).toBeNull();
    expect(sim.snapshot().keyLead.phase).toBe("idle");
    expect(sim.snapshot().targetCallout?.text).toMatch(/Wrong TV/);
    expect(sim.snapshot().ordersNotice).toMatch(/Wrong TV/);
    expect(sim.snapshot().sfxCue?.kind).toBe("wrong");
    sim.shopClick({ type: "item", skuId: order.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().handSkuId).toBe(order.skuId);
    sim.shopClick({ type: "bagRack" });
    expect(order.status).toBe("onPickupShelf");
    expect(sim.snapshot().sfxCue?.kind).toBe("pack");
  });

  it("puts Wrong TV feedback beside the walk-in and on the tapped TV", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    const ticket = sim.spawnOrder("pickup");
    const walkIn = sim.spawnOrder("inStore");
    waitForCustomerAtCounter(sim, walkIn.id);
    sim.shopClick({ type: "tablet", orderId: ticket.id });
    const other = sim.catalog.find((s) => s.id !== walkIn.skuId)!;
    sim.shopClick({ type: "item", skuId: other.id });
    expect(sim.snapshot().handSkuId).toBeNull();
    expect(sim.snapshot().targetCallout?.skuId).toBe(other.id);
    expect(sim.snapshot().customers.find((c) => c.orderId === walkIn.id)?.feedback).toMatch(/Wrong TV/);
    expect(sim.snapshot().toast).toBe("");
    sim.shopClick({ type: "item", skuId: walkIn.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().handSkuId).toBe(walkIn.skuId);
  });

  it("keeps walk-in guidance on the counter prompt, not the bottom toast", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    sim.spawnOrder("inStore");
    expect(sim.snapshot().toast).toBe("");
  });

  it("dedupes holding copy between key lead and customer", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    const order = sim.spawnOrder("inStore");
    waitForCustomerAtCounter(sim, order.id);
    sim.shopClick({ type: "item", skuId: order.skuId });
    waitForFetch(sim);
    const sku = sim.catalog.find((s) => s.id === order.skuId)!;
    const snap = sim.snapshot();
    expect(snap.keyLeadLine).toBe(`Holding ${sku.name}`);
    const customer = snap.customers.find((c) => c.orderId === order.id);
    expect(customer?.bubble).toBe("Tap me");
    expect(customer?.feedback ?? "").toBe("");
    sim.shopClick({ type: "item", skuId: order.skuId });
    expect(sim.snapshot().customers.find((c) => c.orderId === order.id)?.feedback ?? "").toBe("");
  });

  it("dedupes holding copy for ticket bagging on the key lead only", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    sim.shopClick({ type: "tablet", orderId: order.id });
    sim.shopClick({ type: "item", skuId: order.skuId });
    waitForFetch(sim);
    const sku = sim.catalog.find((s) => s.id === order.skuId)!;
    expect(sim.snapshot().keyLeadLine).toBe(`Holding ${sku.name}. Tap a bag`);
    sim.shopClick({ type: "item", skuId: order.skuId });
    expect(sim.snapshot().keyLeadLine).toBe(`Holding ${sku.name}. Tap a bag`);
    expect(sim.snapshot().ordersNotice).not.toMatch(/Already holding/);
  });

  it("scores on-time and late delivery handoffs", () => {
    const onTime = GameSim.create({ seed: 4, autoSpawn: false });
    fillTicket(onTime, "delivery", { destinationId: "house-1" });
    onTime.hitTheRoad();
    finishDropoff(onTime, "house-1");
    expect(onTime.score).toBe(SCORE_DELIVERY_ON_TIME);

    const late = GameSim.create({ seed: 4, autoSpawn: false });
    fillTicket(late, "delivery", { destinationId: "house-1" });
    late.hitTheRoad();
    late.tick(MS_PER_GAME_HOUR + 50);
    finishDropoff(late, "house-1");
    expect(late.score).toBe(SCORE_DELIVERY_LATE);
  });

  it("does not complete a delivery from parking alone — call, ID, bag, and photo are required", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    const stop = houseById("house-1")!;
    const pos = tileToWorld(stop.stop);
    sim.setVehiclePosition(pos.x, pos.y);
    sim.tick(32);
    sim.interact();
    expect(sim.orderById(order.id)?.status).toBe("onRun");
    expect(sim.snapshot().dropoff.phase).toBe("calling");
  });

  it("puts the driver and customer at the door after the call connects", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    const stop = houseById("house-1")!;
    const pos = tileToWorld(stop.stop);
    sim.setVehiclePosition(pos.x, pos.y);
    sim.tick(32);
    sim.interact();
    sim.tick(CALL_CONNECT_MS + 32);
    const drop = sim.snapshot().dropoff;
    expect(drop.phase).toBe("atDoor");
    expect(drop.actionLabel).toBe("ASK ID");
    expect(drop.idAsked).toBe(false);
    expect(drop.idCard).toBeNull();
    expect(drop.customerName).toBe(order.customerName);
    expect(sim.orderById(order.id)?.status).toBe("onRun");
  });

  it("completes a matching-ID stop: ask ID, check ID, hand bag, photo, then returns to the map", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: true });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    expect(sim.snapshot().dropoff.actionLabel).toBe("ASK ID");
    expect(sim.snapshot().dropoff.idCard).toBeNull();
    stepDropoff(sim);
    expect(sim.snapshot().dropoff.actionLabel).toBe("CHECK ID");
    expect(sim.snapshot().dropoff.idCard?.matches).toBe(true);
    stepDropoff(sim);
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    expect(sim.snapshot().dropoff.idCard).toBeNull();
    stepDropoff(sim);
    expect(sim.snapshot().dropoff.actionLabel).toBe("PHOTO");
    stepDropoff(sim);
    expect(sim.orderById(order.id)?.status).toBe("completed");
    expect(sim.snapshot().dropoff.phase).toBe("none");
    expect(sim.snapshot().run).toBeNull();
  });

  it("does not advance past ASK ID on the same tap burst", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: false });
    fillTicket(sim, "delivery", { destinationId: "house-2", idMatches: true });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    sim.interact(); // ask
    sim.interact(); // same-frame burst — must not check/deny yet
    sim.interact();
    expect(sim.snapshot().dropoff.actionLabel).toBe("CHECK ID");
    expect(sim.snapshot().dropoff.phase).toBe("atDoor");
    expect(sim.snapshot().run?.nextStopId).toBe("house-1");
  });

  it("keeps hand-bag and photo working on the first stop of a multi-stop run", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const first = fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: true });
    fillTicket(sim, "delivery", { destinationId: "house-2", idMatches: true });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    stepDropoff(sim); // ask
    stepDropoff(sim); // check
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    // Vehicle nearer the other house must not break the locked door flow.
    const other = tileToWorld(houseById("house-2")!.stop);
    sim.setVehiclePosition(other.x, other.y);
    stepDropoff(sim);
    expect(sim.snapshot().dropoff.actionLabel).toBe("PHOTO");
    stepDropoff(sim);
    expect(sim.orderById(first.id)?.status).toBe("completed");
    expect(sim.snapshot().run?.nextStopId).toBe("house-2");
  });

  it("does not auto-skip bag/photo when ID click-through arrives during the lock", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: true });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    stepDropoff(sim); // ask
    sim.interact(); // check ID — arms full click-through lock
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    expect(sim.snapshot().dropoff.interactArmed).toBe(false);
    sim.queueInteract(); // click-through / double-tap during lock — must discard
    sim.tick(16);
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    sim.tick(NPC_INTERACT_COOLDOWN_MS);
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    expect(sim.snapshot().dropoff.interactArmed).toBe(true);
    stepDropoff(sim);
    expect(sim.snapshot().dropoff.actionLabel).toBe("PHOTO");
  });

  it("requires a fresh press after CHECK ID — held/repeat queues cannot skip bag/photo", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: true });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    stepDropoff(sim); // ask
    sim.interact(); // check ID
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    // Simulate key-repeat / held E across the lock and well past bag+photo cooldowns.
    for (let i = 0; i < 40; i++) {
      sim.queueInteract();
      sim.tick(50);
    }
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    expect(sim.orderById(order.id)?.status).toBe("onRun");
    // Quiet frame releases the latch; the next deliberate press hands the bag.
    sim.tick(16);
    stepDropoff(sim);
    expect(sim.snapshot().dropoff.actionLabel).toBe("PHOTO");
    stepDropoff(sim);
    expect(sim.orderById(order.id)?.status).toBe("completed");
  });

  it("edge-triggered press/release blocks held touch through CHECK ID into bag/photo", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: true });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    stepDropoff(sim); // ask
    sim.pressDropoffConfirm(); // check ID — finger still down
    sim.tick(16);
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    for (let i = 0; i < 30; i++) {
      sim.pressDropoffConfirm();
      sim.tick(50);
    }
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    expect(sim.orderById(order.id)?.status).toBe("onRun");
    sim.releaseDropoffConfirm();
    sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
    sim.pressDropoffConfirm();
    sim.releaseDropoffConfirm();
    sim.tick(16);
    expect(sim.snapshot().dropoff.actionLabel).toBe("PHOTO");
    sim.pressDropoffConfirm();
    sim.releaseDropoffConfirm();
    sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
    sim.pressDropoffConfirm();
    sim.releaseDropoffConfirm();
    sim.tick(16);
    expect(sim.orderById(order.id)?.status).toBe("completed");
    expect(sim.snapshot().dropoff.phase).toBe("none");
  });

  it("clears dropoffConfirmHeld when CHECK ID closes without pointerup", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: true });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    stepDropoff(sim); // ask
    sim.pressDropoffConfirm(); // check ID — no release (card hides mid-gesture)
    sim.tick(16);
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
    sim.pressDropoffConfirm();
    sim.releaseDropoffConfirm();
    sim.tick(16);
    expect(sim.snapshot().dropoff.actionLabel).toBe("PHOTO");
  });

  it("second stop accepts bag tap after the ID card closes", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: true });
    fillTicket(sim, "delivery", { destinationId: "house-2", idMatches: true });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    stepDropoff(sim); // ask
    stepDropoff(sim); // check
    stepDropoff(sim); // hand bag
    stepDropoff(sim); // photo
    expect(sim.snapshot().run?.nextStopId).toBe("house-2");
    startDoor(sim, "house-2");
    stepDropoff(sim); // ask
    sim.pressDropoffConfirm();
    sim.tick(16); // check without release
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
    sim.pressDropoffConfirm();
    sim.releaseDropoffConfirm();
    sim.tick(16);
    expect(sim.snapshot().dropoff.actionLabel).toBe("PHOTO");
  });

  it("rapid double-confirm during lock advances at most one step after release", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: true });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    stepDropoff(sim);
    sim.pressDropoffConfirm();
    sim.releaseDropoffConfirm();
    sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
    sim.pressDropoffConfirm();
    sim.releaseDropoffConfirm();
    sim.tick(16);
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    sim.pressDropoffConfirm();
    for (let i = 0; i < 8; i++) {
      sim.pressDropoffConfirm();
      sim.queueInteract();
      sim.tick(16);
    }
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    sim.releaseDropoffConfirm();
    sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
    sim.pressDropoffConfirm();
    sim.releaseDropoffConfirm();
    sim.tick(16);
    expect(sim.snapshot().dropoff.actionLabel).toBe("PHOTO");
  });

  it("denies a mismatched-ID stop, fails the order, and returns to the map", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: false });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    expect(sim.snapshot().dropoff.actionLabel).toBe("ASK ID");
    expect(sim.snapshot().dropoff.idCard).toBeNull();
    stepDropoff(sim);
    expect(sim.snapshot().dropoff.idCard?.matches).toBe(false);
    stepDropoff(sim);
    expect(sim.orderById(order.id)?.status).toBe("failed");
    expect(sim.score).toBe(SCORE_FAIL);
    expect(sim.snapshot().dropoff.phase).toBe("none");
    expect(sim.snapshot().run).toBeNull();
  });

  it("after a mismatched-ID deny, GPS still points at the next bag on the run", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    const first = fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: false });
    const second = fillTicket(sim, "delivery", { destinationId: "house-2", idMatches: true });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    stepDropoff(sim);
    stepDropoff(sim);
    expect(sim.orderById(first.id)?.status).toBe("failed");
    expect(sim.orderById(second.id)?.status).toBe("onRun");
    expect(sim.snapshot().run?.nextStopId).toBe("house-2");
    expect(sim.snapshot().dropoff.phase).toBe("none");
    finishDropoff(sim, "house-2");
    expect(sim.orderById(second.id)?.status).toBe("completed");
    expect(sim.snapshot().dropoff.phase).toBe("none");
    expect(sim.snapshot().run).toBeNull();
  });

  it("only returns to the shop when the vehicle is near Kindling", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    const house = tileToWorld(houseById("house-1")!.stop);
    sim.setVehiclePosition(house.x, house.y);
    expect(sim.backToShop()).toBe(false);
    expect(sim.snapshot().playerRole).toBe("driver");
    expect(sim.snapshot().toast).toBe("Drive up to the shop first.");
    const shop = tileToWorld(CITY.shopSpawn);
    sim.setVehiclePosition(shop.x, shop.y);
    expect(sim.backToShop()).toBe(true);
    expect(sim.snapshot().playerRole).toBe("keyLead");
  });

  it("hands every packed counter bag on one multi-stop run", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    const first = fillTicket(sim, "delivery", { destinationId: "house-1" });
    const second = fillTicket(sim, "delivery", { destinationId: "house-2" });
    sim.hitTheRoad();
    expect(sim.snapshot().run?.orderIds).toEqual([first.id, second.id]);
    finishDropoff(sim, "house-1");
    expect(sim.orderById(first.id)?.status).toBe("completed");
    expect(sim.orderById(second.id)?.status).toBe("onRun");
    expect(sim.snapshot().run?.nextStopId).toBe("house-2");
    finishDropoff(sim, "house-2");
    expect(sim.orderById(second.id)?.status).toBe("completed");
    expect(sim.snapshot().run).toBeNull();
    expect(sim.score).toBe(SCORE_DELIVERY_ON_TIME * 2);
  });

  it("takes multiple bin bags on one run", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    fillTicket(sim, "delivery", { destinationId: "house-2" });
    expect(sim.snapshot().bagsInBin).toHaveLength(2);
    sim.hitTheRoad();
    const run = sim.snapshot().run;
    expect(run?.orderIds).toHaveLength(2);
    expect(run?.nextStopId).toBeTruthy();
  });

  it("auto-drives toward the next parking stop without steer input", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    const start = { ...sim.snapshot().vehicle };
    expect(sim.snapshot().autoDriving).toBe(true);
    for (let i = 0; i < 400; i++) sim.tick(50);
    const after = sim.snapshot().vehicle;
    expect(Math.hypot(after.x - start.x, after.y - start.y)).toBeGreaterThan(120);
  });

  it("lets pad/WASD nudge override auto-drive while en route", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    const start = { ...sim.snapshot().vehicle };
    sim.setPlayerInput(0, 1);
    for (let i = 0; i < 20; i++) sim.tick(50);
    const after = sim.snapshot().vehicle;
    expect(after.y).toBeGreaterThan(start.y + 40);
  });

  it("auto-parks in the driveway so the phone call can start", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    for (let i = 0; i < 2_000 && sim.snapshot().autoDriving; i++) sim.tick(50);
    expect(sim.snapshot().autoDriving).toBe(false);
    expect(sim.snapshot().dropoff.phase).toBe("atCurb");
    expect(sim.snapshot().dropoff.actionLabel).toBe("CALL");
    const stop = houseById("house-1")!;
    const pad = tileToWorld(stop.stop);
    const v = sim.snapshot().vehicle;
    expect(Math.hypot(v.x - pad.x, v.y - pad.y)).toBeLessThan(2);
  });

  /**
   * The van used to come to rest still aimed at the house, so it sat skewed across the
   * pad instead of squared up in it. Lots are dealt round-robin across every block, so a
   * lot fronting a north–south street parks on a different axis than one on an east–west
   * street — driving only the nearest house would leave half the city untested.
   */
  it.each([
    ["an east-west street", CITY.houses.find((h) => h.street.c === h.stop.c)!],
    ["a north-south street", CITY.houses.find((h) => h.street.r === h.stop.r)!],
  ])("parks square with the kerb at a lot on %s", (_label, house) => {
    expect(house, "the city has no lot on this street orientation").toBeDefined();
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: house.id });
    sim.hitTheRoad();
    for (let i = 0; i < 2_000 && sim.snapshot().autoDriving; i++) sim.tick(50);
    expect(sim.snapshot().autoDriving, `${house.id} never arrived`).toBe(false);

    // The last turn is rate limited, so settle it — and check on the way that it was a
    // turn and not a snap.
    let heading = sim.snapshot().vehicle.heading;
    let biggestStep = 0;
    for (let i = 0; i < 80; i++) {
      sim.tick(50);
      const next = sim.snapshot().vehicle.heading;
      biggestStep = Math.max(biggestStep, Math.abs(angleDelta(heading, next)));
      heading = next;
    }
    expect(biggestStep, `${house.id} jumped mid-park`).toBeLessThanOrEqual(PARK_TURN_RATE * 0.05 + 1e-6);

    // Along the street it fronts, with no component across it.
    const acrossStreet = house.street.c === house.stop.c ? Math.sin(heading) : Math.cos(heading);
    expect(house.street.c === house.stop.c ? isEWStreet(house.street.r) : isNSStreet(house.street.c)).toBe(true);
    expect(Math.abs(acrossStreet), `${house.id} sits skewed`).toBeCloseTo(0);

    // Pointing the way its own kerb lane runs, checked against the game's lane table.
    const ahead = {
      c: house.street.c + Math.round(Math.cos(heading)),
      r: house.street.r + Math.round(Math.sin(heading)),
    };
    expect(driveLaneCell(house.street, ahead), `${house.id} faces oncoming traffic`).toEqual(house.street);

    // And explicitly not the old behaviour: aimed at the house it just delivered to.
    const v = sim.snapshot().vehicle;
    const home = lotCenter(house.house, house.lotW, house.lotH);
    const atHouse = Math.atan2(home.y - v.y, home.x - v.x);
    expect(Math.abs(angleDelta(heading, atHouse)), `${house.id} still faces the house`).toBeGreaterThan(0.6);
  });

  /**
   * The acceptance test for lawful approaches, and the one that would have caught the
   * original fault. When the route reaches a stall from the far lane, the van arrives
   * across the kerb and has to swing most of a half-circle to square up. Exactly seven of
   * the city's fourteen lots did that, and this is the whole list, named individually:
   * house-2 and house-10 turned 132 degrees, house-6 87, house-13 84, and house-5,
   * house-7 and house-9 76. Do not restate any part of it by orientation — house-13 is
   * itself one of the four EW-fronting lots (house-5, 7, 9, 13), so calling the
   * 76-degree group "the four east-west lots" counts house-13 twice and the seven read
   * as eight. That miscount has already escaped this comment once.
   *
   * The set has a shape, and it is checkable against CITY.houses rather than taken on
   * trust: every EW-fronting lot was affected (street.c === stop.c: house-5, 7, 9, 13),
   * plus exactly the three NS-fronting lots whose kerb tile sits west of their stall
   * (street.c === stop.c - 1: house-2, 6, 10). The other seven all front their street
   * from the east and always arrived square. So a spot check that sampled only those
   * would have passed on a broken city, which is why this drives every lot instead of a
   * sample; a ceiling on the turn then catches the whole class without knowing which lot
   * broke.
   *
   * What keeps the turn small is no longer only the lawful approach. Four lots — house-2,
   * house-6, house-10 and house-13 — now cross the road when it saves a block, and a van
   * that crossed rests nose-in instead of pivoting into line with the kerb (see
   * `stallRestHeading`). Both routes are therefore under this ceiling, and it is still the
   * same fault being watched for: a van that ends up sideways in the stall.
   */
  it("arrives square enough to park at every lot in the city", () => {
    const ARRIVAL_TURN_MAX_DEG = 55;
    const measured: string[] = [];
    const over: string[] = [];
    for (const house of CITY.houses) {
      const axis = house.street.c === house.stop.c ? "EW" : "NS";
      const sim = GameSim.create({ seed: 5, autoSpawn: false });
      fillTicket(sim, "delivery", { destinationId: house.id });
      sim.hitTheRoad();
      let approach = sim.snapshot().vehicle.heading;
      for (let i = 0; i < 2_000 && sim.snapshot().autoDriving; i++) {
        approach = sim.snapshot().vehicle.heading;
        sim.tick(50);
      }
      expect(sim.snapshot().autoDriving, `${house.id} never arrived`).toBe(false);
      // The squaring-up turn is rate limited; 30 ticks covers a half-circle of it.
      for (let i = 0; i < 30; i++) sim.tick(50);
      const turn = Math.abs((angleDelta(approach, sim.snapshot().vehicle.heading) * 180) / Math.PI);
      measured.push(`${house.id}(${axis}) ${turn.toFixed(0)}`);
      if (turn >= ARRIVAL_TURN_MAX_DEG) over.push(`${house.id}(${axis}) ${turn.toFixed(0)}`);
    }
    expect(measured).toHaveLength(CITY.houses.length);
    expect(over, `arrived across the kerb; all lots: ${measured.join(", ")}`).toEqual([]);
  });

  it("eases the last turn into the stall over several ticks", () => {
    // Driven in rather than dropped on the pad. The turn only exists for a van that came up
    // the frontage and swung into the stall, and how far off the rest heading it arrives is
    // exactly what decides whether it squares up at all — a teleported van arrives on
    // whatever heading it left the shop with, which is not the case under test.
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-3" });
    sim.hitTheRoad();
    for (let i = 0; i < 2_000 && sim.snapshot().autoDriving; i++) sim.tick(50);
    expect(sim.snapshot().autoDriving, "never arrived").toBe(false);
    const onArrival = sim.snapshot().vehicle.heading;

    let settledAfter = 0;
    let heading = onArrival;
    for (let i = 0; i < 200; i++) {
      sim.tick(16);
      const next = sim.snapshot().vehicle.heading;
      if (Math.abs(angleDelta(heading, next)) > 1e-9) settledAfter = i + 1;
      heading = next;
    }

    // A real turn happened, it took time, and it came to rest on the kerb lane's heading.
    const house = houseById("house-3")!;
    const kerb = kerbParkHeading(house.stop, house.street);
    expect(Math.abs(angleDelta(onArrival, heading)), "nothing to turn — pick another lot").toBeGreaterThan(0.3);
    expect(settledAfter, "snapped instead of easing").toBeGreaterThan(1);
    expect(angleDelta(heading, kerb), "came to rest off the kerb").toBeCloseTo(0);
  });

  it("queues behind traffic at the follow gap and still reaches the stop", () => {
    // 50ms ticks match the auto-drive's own slice, so this is the same drive at a third of
    // the cost. Two phases is enough: both put ~250 ticks of lane traffic in front of the
    // van. Mid-corner shoves are pinned cheaply by the time sweep in traffic.test.ts.
    for (const phaseMs of [1_500, 4_000]) {
      const sim = GameSim.create({ seed: 5, autoSpawn: false });
      fillTicket(sim, "delivery", { destinationId: "house-3" });
      sim.hitTheRoad();
      sim.clock.gameMs = phaseMs;
      let queuedTicks = 0;
      let tightest = Infinity;
      for (let i = 0; i < 1_200 && sim.snapshot().autoDriving; i++) {
        const v = sim.snapshot().vehicle;
        const cars = trafficCars(sim.clock.gameMs, cityTrafficLoops(), v);
        const cos = Math.cos(v.heading);
        const sin = Math.sin(v.heading);
        for (const car of cars) {
          const dx = car.x - v.x;
          const dy = car.y - v.y;
          const gap = Math.hypot(dx, dy);
          if (gap >= TRAFFIC_LOOK_AHEAD) continue;
          if (cos * dx + sin * dy < 36) continue;
          if (Math.abs(-sin * dx + cos * dy) > TRAFFIC_LANE_WIDTH) continue;
          queuedTicks += 1;
          tightest = Math.min(tightest, gap);
        }
        sim.tick(50);
      }
      // A bigger follow gap must never stall the route or deadlock against a lead car.
      expect(sim.snapshot().autoDriving, `phase ${phaseMs} stalled`).toBe(false);
      expect(queuedTicks, `phase ${phaseMs} never met traffic`).toBeGreaterThan(0);
      // Queued means tucked into the follow band — close up, but never inside a car.
      expect(tightest, `phase ${phaseMs} nose-to-tail`).toBeGreaterThanOrEqual(TRAFFIC_MIN_SEP - 1);
      expect(tightest, `phase ${phaseMs} never closed up`).toBeLessThan(VAN_MATCH_GAP + 24);
    }
  });

  /**
   * The delivery end of the crossing rule. house-10 and house-13 both cross the road to
   * their stall (see `approachToStall`), so their last move takes the van through a lane it
   * does not travel — the one place a delivery meets traffic side-on. Phase 12250 was
   * measured to make the van wait at a junction on the way; phase 0 runs clear. Waiting is
   * asserted where it belongs, on the rule itself in traffic.test.ts, because a wait here
   * lasts a tick or two and a creep still counts as movement. What this pins is the pair of
   * things the route change could break: the van still arrives, and it does not pass
   * through a car on its way across.
   */
  it("crosses the road to a stall without driving through the traffic on it", () => {
    let metTrafficSideOn = 0;
    for (const [houseId, phaseMs] of [
      ["house-13", 0],
      ["house-10", 12_250],
    ] as const) {
      const sim = GameSim.create({ seed: 5, autoSpawn: false });
      fillTicket(sim, "delivery", { destinationId: houseId });
      sim.hitTheRoad();
      sim.clock.gameMs = phaseMs;

      let tightest = Infinity;
      let crossed = false;
      for (let i = 0; i < 1_200 && sim.snapshot().autoDriving; i++) {
        sim.tick(50);
        const v = sim.snapshot().vehicle;
        for (const car of trafficCars(sim.clock.gameMs, cityTrafficLoops(), v)) {
          tightest = Math.min(tightest, Math.hypot(car.x - v.x, car.y - v.y));
          // Side-on to a car in a lane: the geometry the kerb approach used to rule out.
          const cos = Math.cos(v.heading);
          const sin = Math.sin(v.heading);
          const along = Math.abs(cos * Math.cos(car.angle) + sin * Math.sin(car.angle));
          if (along < 0.35 && Math.hypot(car.x - v.x, car.y - v.y) < TRAFFIC_LOOK_AHEAD) crossed = true;
        }
      }

      const label = `${houseId} phase ${phaseMs}`;
      expect(sim.snapshot().autoDriving, `${label} never parked`).toBe(false);
      expect(tightest, `${label} drove through a car`).toBeGreaterThanOrEqual(TRAFFIC_MIN_SEP - 1);
      if (crossed) metTrafficSideOn += 1;
    }
    // One of the two has to actually meet traffic side-on, or the separation figure above is
    // measured against an empty road and would pass however badly the van crossed.
    expect(metTrafficSideOn, "neither run met a car side-on — the case went untested").toBeGreaterThan(0);
  });

  it("steers the traffic rules with the waypoint it is turning toward", () => {
    // Wiring, not geometry: the lane a turn crosses is only visible from the heading the van
    // is steering at, and mid-turn its nose is still in the lane it is leaving. Drop the
    // argument and every rule still passes while the van turns across traffic blind, so the
    // call itself is what has to be pinned. The rule it feeds is covered in traffic.test.ts.
    const src = readFileSync(new URL("./gameSim.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    // Markers checked before slicing: a scan that quietly matches nothing passes for the
    // wrong reason, and this repo has been caught by exactly that.
    const from = src.indexOf("private tickAutoDrive(");
    const to = src.indexOf("private parkAt(");
    expect(from, "tickAutoDrive not found").toBeGreaterThan(-1);
    expect(to, "parkAt not found").toBeGreaterThan(from);
    const auto = src.slice(from, to);
    expect(auto, "no waypoint read").toMatch(/this\.driveRoute\[this\.driveWaypoint\]/);
    expect(auto, "no intent derived from it").toMatch(/Math\.atan2\(aim\.y - this\.vehicle\.y/);
    const call = auto.slice(auto.indexOf("driveSpeedForTraffic("));
    expect(call.slice(0, call.indexOf(");")), "intent not passed through").toMatch(/intent,/);
  });

  it("lets the driver leave with packed deliveries while more tickets wait", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const packed = fillTicket(sim, "delivery", { destinationId: "house-1" });
    const waiting = sim.spawnOrder("delivery", { destinationId: "house-2" });
    sim.shopClick({ type: "tablet", orderId: waiting.id });
    const snap = sim.snapshot();
    expect(snap.canHitTheRoad).toBe(true);
    expect(snap.awaitingBag).toBe(false);
    expect(snap.highlightSkuId).toBe(waiting.skuId);
    expect(snap.bagsInBin).toEqual([packed.id]);
    expect(sim.hitTheRoad()).toBe(true);
    expect(sim.snapshot().playerRole).toBe("driver");
    expect(sim.snapshot().run?.orderIds).toEqual([packed.id]);
    expect(waiting.status).toBe("queued");
  });

  it("lets the NPC key-lead bag a delivery while the player drives", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    sim.spawnOrder("delivery", { destinationId: "house-3" });
    for (let i = 0; i < 240; i++) sim.tick(50);
    expect(sim.snapshot().bagsInBin.length).toBeGreaterThan(0);
  });

  it("generates a unique catalog for the session", () => {
    const sim = GameSim.create({ seed: 9, autoSpawn: false });
    const names = sim.catalog.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(sim.catalog).toHaveLength(9);
  });

  it("shows one tablet ticket and never auto-queues more than 6", () => {
    const sim = GameSim.create({ seed: 7, autoSpawn: true });
    sim.tick(OPENING_FIRST_AT_MS + OPENING_ORDER_GAP_MS + 400);
    expect(sim.snapshot().tabletQueueCount).toBeGreaterThanOrEqual(1);
    expect(sim.snapshot().tabletQueueCount).toBeLessThanOrEqual(2);
    expect(sim.snapshot().tabletTicket).toBeTruthy();
    for (let i = 0; i < 240; i++) sim.tick(500);
    expect(sim.snapshot().tabletQueueCount).toBeLessThanOrEqual(6);
  });

  it("scripts the first beats as walk-in, pickup, then two deliveries", () => {
    const sim = GameSim.create({ seed: 7, autoSpawn: true });
    sim.tick(OPENING_FIRST_AT_MS + 50);
    expect(sim.snapshot().orders.map((o) => o.type)).toEqual(["inStore"]);
    sim.tick(OPENING_ORDER_GAP_MS);
    expect(sim.snapshot().orders.map((o) => o.type)).toEqual(["inStore", "pickup"]);
    sim.tick(OPENING_ORDER_GAP_MS);
    const types = sim.snapshot().orders.map((o) => o.type);
    expect(types.filter((t) => t === "delivery")).toHaveLength(2);
    expect(types).toHaveLength(4);
  });

  it("paces the tablet at three quarters of its original rate", () => {
    // Was a flat "caps waves at 58 seconds". The claim that matters is the gap (and rate).
    expect(TICKET_WAVE_MIN_MS).toBe(13_333);
    expect(TICKET_WAVE_MAX_MS).toBe(77_333);
    const meanGap = (TICKET_WAVE_MIN_MS + TICKET_WAVE_MAX_MS) / 2;
    expect(meanGap / ((10_000 + 58_000) / 2)).toBeCloseTo(4 / 3, 3);
    expect(TICKET_WAVE_GAP_SCALE).toBeCloseTo(4 / 3, 6);
  });

  it("calls out item and customer after the tablet is tapped", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    const sku = sim.catalog.find((s) => s.id === order.skuId)!;
    expect(sim.snapshot().keyLeadLine).toBeNull();
    sim.shopClick({ type: "tablet", orderId: order.id });
    expect(sim.snapshot().keyLeadLine).toBe(`Pickup: ${sku.name} for ${order.customerName}`);
  });

  it("selects a delivery ticket without sending the driver", () => {
    const sim = GameSim.create({ seed: 3, autoSpawn: false });
    const order = sim.spawnOrder("delivery", { destinationId: "house-1" });
    const sku = sim.catalog.find((s) => s.id === order.skuId)!;
    sim.shopClick({ type: "tablet", orderId: order.id });
    expect(sim.snapshot().keyLeadLine).toBe(`Delivery: ${sku.name} for ${order.customerName}`);
    expect(sim.snapshot().highlightSkuId).toBe(order.skuId);
    expect(sim.snapshot().awaitingBag).toBe(false);
    expect(sim.snapshot().playerRole).toBe("keyLead");
    expect(order.status).toBe("queued");
  });

  it("highlights the TV after the tablet is tapped, then the bag after fetch", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    expect(sim.snapshot().highlightSkuId).toBeNull();
    sim.shopClick({ type: "tablet", orderId: order.id });
    expect(sim.snapshot().highlightSkuId).toBe(order.skuId);
    expect(sim.snapshot().awaitingBag).toBe(false);
    expect(sim.snapshot().selectedOrderId).toBe(order.id);
    sim.shopClick({ type: "item", skuId: order.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().highlightSkuId).toBeNull();
    expect(sim.snapshot().awaitingBag).toBe(true);
  });

  it("queues a second ticket instead of interrupting the current bag", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const first = sim.spawnOrder("pickup");
    const second = sim.spawnOrder("delivery", { destinationId: "house-1" });
    sim.shopClick({ type: "tablet", orderId: first.id });
    sim.shopClick({ type: "tablet", orderId: second.id });
    expect(sim.snapshot().selectedOrderId).toBe(first.id);
    expect(sim.snapshot().highlightSkuId).toBe(first.skuId);
    expect(sim.snapshot().tabletTicket?.id).toBeUndefined();
  });

  it("same-ticket tablet re-tap is a notice-only no-op — orders and phase unchanged", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    sim.shopClick({ type: "tablet", orderId: order.id });
    expect(order.status).toBe("queued");
    const ordersBefore = sim.snapshot().orders.length;
    sim.shopClick({ type: "tablet", orderId: order.id });
    sim.shopClick({ type: "tablet", orderId: order.id });
    expect(sim.snapshot().orders.length).toBe(ordersBefore);
    expect(order.status).toBe("queued");
    expect(sim.snapshot().selectedOrderId).toBe(order.id);
  });

  it("repeated bag-rack no-op keeps snap cache when the notice is already shown", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    sim.shopClick({ type: "bagRack" });
    const snap1 = sim.snapshot();
    sim.shopClick({ type: "bagRack" });
    expect(sim.snapshot()).toBe(snap1);
  });

  it("starts the next queued ticket after the current bag is sealed", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const first = sim.spawnOrder("pickup");
    const second = sim.spawnOrder("delivery", { destinationId: "house-1" });
    sim.shopClick({ type: "tablet", orderId: first.id });
    sim.shopClick({ type: "tablet", orderId: second.id });
    sim.shopClick({ type: "item", skuId: first.skuId });
    waitForFetch(sim);
    sim.shopClick({ type: "bagRack" });
    expect(first.status).toBe("onPickupShelf");
    expect(sim.snapshot().selectedOrderId).toBe(second.id);
    expect(sim.snapshot().highlightSkuId).toBe(second.skuId);
    expect(sim.snapshot().awaitingBag).toBe(false);
    expect(sim.snapshot().bagsOnPickup).toContain(first.id);
    sim.shopClick({ type: "item", skuId: second.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().awaitingBag).toBe(true);
    expect(sim.snapshot().highlightSkuId).toBeNull();
  });

  it("resets the clock to 9:00 and clears a door stop rather than restarting its SLA", () => {
    // Was "clears a door stop so leftover SLAs are not LATE", and asserted the in-flight
    // delivery survived as `onRun` with its hour restarted. That claim described a clock
    // rewind, and a rewind is what stranded a walk-in on the floor after a reset. The
    // button is now a cold start, so the right claim is that the run is gone entirely.
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    sim.tick(MS_PER_GAME_HOUR + 50);
    expect(sim.snapshot().clockLabel).not.toBe("09:00");
    expect(sim.snapshot().dropoff.phase).toBe("atDoor");
    expect(sim.snapshot().orders.find((o) => o.id === order.id)?.late).toBe(true);
    sim.resetToMorning();
    const snap = sim.snapshot();
    expect(snap.clockLabel).toBe("09:00");
    expect(snap.dropoff.phase).toBe("none");
    expect(sim.orderById(order.id)).toBeUndefined();
    expect(snap.orders).toHaveLength(0);
    expect(snap.run).toBeNull();
    expect(snap.playerRole).toBe("keyLead");
  });

  it("leaves each sealed bag on the counter", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    const a = fillTicket(sim, "pickup");
    const b = fillTicket(sim, "delivery", { destinationId: "house-1" });
    const snap = sim.snapshot();
    expect(a.status).toBe("onPickupShelf");
    expect(b.status).toBe("inBin");
    expect(snap.bagsOnPickup).toContain(a.id);
    expect(snap.bagsInBin).toContain(b.id);
  });

  it("ends the shift at 23:00 with a results breakdown and no softlock mid-door", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    expect(sim.snapshot().dropoff.phase).toBe("atDoor");
    sim.tick(SHIFT_MS);
    const snap = sim.snapshot();
    expect(snap.clockLabel).toBe("23:00");
    expect(snap.shiftEnded).toBe(true);
    expect(snap.dropoff.phase).toBe("none");
    expect(snap.shiftResults).not.toBeNull();
    expect(snap.shiftResults!.breakdown).toBeDefined();
    sim.tick(5_000);
    expect(sim.snapshot().shiftEnded).toBe(true);
    expect(sim.snapshot().clockLabel).toBe("23:00");
  });

  it("allows end-shift early after a scored action and startNewDay clears score", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    expect(sim.endShiftEarly()).toBe(false);
    expect(sim.snapshot().canEndShiftEarly).toBe(false);
    fillTicket(sim, "inStore");
    expect(sim.score).toBe(SCORE_INSTORE);
    expect(sim.snapshot().canEndShiftEarly).toBe(true);
    expect(sim.endShiftEarly()).toBe(true);
    expect(sim.snapshot().shiftEnded).toBe(true);
    expect(sim.snapshot().shiftResults!.breakdown.inStore).toBe(1);
    sim.startNewDay();
    const snap = sim.snapshot();
    expect(snap.shiftEnded).toBe(false);
    expect(snap.clockLabel).toBe("09:00");
    expect(snap.score).toBe(0);
    expect(snap.playerRole).toBe("keyLead");
    expect(snap.shiftResults).toBeNull();
  });

  it("stops scoring after the shift ends", () => {
    const sim = GameSim.create({ seed: 3, autoSpawn: false });
    fillTicket(sim, "inStore");
    expect(sim.score).toBe(SCORE_INSTORE);
    const flash = sim.snapshot().scoreFlash;
    expect(flash?.delta).toBe(SCORE_INSTORE);
    expect(flash?.anchor.space).toBe("shop");
    sim.endShift();
    const score = sim.score;
    sim.tick(60_000);
    expect(sim.score).toBe(score);
    expect(sim.snapshot().shiftEnded).toBe(true);
  });

  it("lets the driver leave a walk-in with the key lead instead of pinning them to the floor", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    const walk = sim.spawnOrder("inStore", { idMatches: true });
    waitForCustomerAtCounter(sim, walk.id);
    expect(sim.snapshot().canHitTheRoad).toBe(true);
    expect(sim.hitTheRoad()).toBe(true);
    expect(sim.snapshot().playerRole).toBe("driver");
    expect(sim.snapshot().toast).toContain(walk.customerName);
    runCover(sim, () => sim.orderById(walk.id)?.status === "completed");
    expect(sim.orderById(walk.id)?.status).toBe("completed");
    expect(sim.score).toBe(SCORE_INSTORE);
  });

  it("clears hand and key-lead fetch state when a walk-in walks out mid-fetch", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    const order = sim.spawnOrder("inStore");
    waitForCustomerAtCounter(sim, order.id);
    sim.shopClick({ type: "item", skuId: order.skuId });
    expect(sim.snapshot().keyLead.phase).not.toBe("idle");
    for (let t = 0; t < INSTORE_WALKOUT_MS + 2_000; t += 50) sim.tick(50);
    expect(sim.orderById(order.id)?.status).toBe("failed");
    expect(sim.snapshot().keyLead.phase).toBe("idle");
    expect(sim.snapshot().handSkuId).toBeNull();
  });

  it("catches up a key-lead fetch across a single long hitch frame", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    sim.shopClick({ type: "tablet", orderId: order.id });
    sim.shopClick({ type: "item", skuId: order.skuId });
    expect(sim.snapshot().keyLead.phase).toBe("toBack");
    sim.tick(8_000);
    expect(sim.snapshot().keyLead.phase).toBe("idle");
    expect(sim.snapshot().handSkuId).toBe(order.skuId);
  });
});

describe("key lead covering the counter while the van is out", () => {
  /** Puts one packed delivery in the van and sends the player out. */
  function sendVanOut(sim: GameSim): void {
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    expect(sim.hitTheRoad()).toBe(true);
  }

  it("leaves the floor to the player while they are still in the shop", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    const walk = sim.spawnOrder("inStore", { idMatches: true });
    waitForCustomerAtCounter(sim, walk.id);
    expect(sim.snapshot().shopCover.active).toBe(false);
    for (let i = 0; i < 40; i++) sim.tick(50);
    expect(sim.orderById(walk.id)?.status).toBe("atRegister");
    expect(sim.score).toBe(0);
  });

  it("serves a walk-in who arrives after the van has already left", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    sendVanOut(sim);
    const walk = sim.spawnOrder("inStore", { idMatches: true });
    runCover(sim, () => sim.orderById(walk.id)?.status === "completed");
    expect(sim.orderById(walk.id)?.status).toBe("completed");
    expect(sim.score).toBe(SCORE_INSTORE);
  });

  it("hands off a pickup that ripens while the driver is away", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    const pick = fillTicket(sim, "pickup");
    sendVanOut(sim);
    expect(sim.orderById(pick.id)?.status).toBe("onPickupShelf");
    runCover(sim, () => sim.orderById(pick.id)?.status === "completed");
    expect(sim.orderById(pick.id)?.status).toBe("completed");
    expect(sim.score).toBe(SCORE_PICKUP);
  });

  it("packs and hands a pickup ticket that lands mid-run", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    sendVanOut(sim);
    const pick = sim.spawnOrder("pickup", { idMatches: true });
    runCover(sim, () => sim.orderById(pick.id)?.status === "completed");
    expect(sim.orderById(pick.id)?.status).toBe("completed");
    expect(sim.score).toBe(SCORE_PICKUP);
  });

  // A stack this size is within one person's reach; see "the key lead can be outrun by
  // the counter" for what happens once it is not.
  it("clears a stacked counter during a long run without losing anyone", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    sendVanOut(sim);
    const ids = Array.from({ length: 4 }, (_, n) =>
      sim.spawnOrder(n % 2 ? "inStore" : "pickup", { idMatches: true }).id,
    );
    runCover(sim, () => ids.every((id) => sim.orderById(id)?.status === "completed"), 1_200);
    expect(ids.map((id) => sim.orderById(id)?.status)).toEqual(ids.map(() => "completed"));
    expect(sim.score).toBe(2 * SCORE_INSTORE + 2 * SCORE_PICKUP);
    expect(sim.snapshot().shopCover.lost).toBe(0);
  });

  it("keeps packing when the player drove off with a ticket already claimed", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    const older = sim.spawnOrder("pickup", { idMatches: true });
    const newer = sim.spawnOrder("pickup", { idMatches: true });
    sim.shopClick({ type: "tablet", orderId: newer.id });
    expect(sim.snapshot().selectedOrderId).toBe(newer.id);
    expect(older.status).toBe("queued");
    expect(sim.hitTheRoad()).toBe(true);
    runCover(
      sim,
      () => [older.id, newer.id].every((id) => sim.orderById(id)?.status === "completed"),
      900,
    );
    expect(sim.orderById(newer.id)?.status).toBe("completed");
    expect(sim.orderById(older.id)?.status).toBe("completed");
  });

  it("scores each covered order exactly once and cannot be paid twice", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    sendVanOut(sim);
    const walk = sim.spawnOrder("inStore", { idMatches: true });
    const pick = sim.spawnOrder("pickup", { idMatches: true });
    runCover(sim, () =>
      [walk.id, pick.id].every((id) => sim.orderById(id)?.status === "completed"),
    );
    expect(sim.score).toBe(SCORE_INSTORE + SCORE_PICKUP);
    expect(sim.snapshot().shopCover.served).toBe(2);

    // Stale taps and further cover ticks must not re-close an order that is already paid.
    const score = sim.score;
    sim.shopClick({ type: "customer", orderId: walk.id });
    sim.shopClick({ type: "customer", orderId: pick.id });
    sim.shopClick({ type: "handoff" });
    for (let i = 0; i < 40; i++) sim.tick(50);
    expect(sim.score).toBe(score);
    expect(sim.snapshot().shopCover.served).toBe(2);
    expect(sim.snapshot().orders.some((o) => o.id === walk.id || o.id === pick.id)).toBe(false);

    sim.endShift();
    const breakdown = sim.snapshot().shiftResults!.breakdown;
    expect(breakdown.inStore).toBe(1);
    expect(breakdown.pickups).toBe(1);
    expect(breakdown.fails).toBe(0);
  });

  it("holds the courier hour on a bag packed while the van is out until the driver is back", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    sendVanOut(sim);
    const later = sim.spawnOrder("delivery", { destinationId: "house-3", idMatches: true });
    runCover(sim, () => sim.orderById(later.id)?.status === "inBin");
    expect(sim.orderById(later.id)?.status).toBe("inBin");
    expect(sim.orderById(later.id)?.slaStartGameMs).toBeUndefined();
    expect(sim.snapshot().orders.find((o) => o.id === later.id)?.slaRemainingMs).toBeNull();
    expect(sim.snapshot().shopCover.packed).toBe(1);

    // A run longer than the SLA itself must not hand the player a bag that is already late.
    sim.tick(MS_PER_GAME_HOUR);
    expect(sim.snapshot().orders.find((o) => o.id === later.id)?.late).toBe(false);

    const shop = tileToWorld(CITY.shopSpawn);
    sim.setVehiclePosition(shop.x, shop.y);
    expect(sim.backToShop()).toBe(true);
    expect(sim.orderById(later.id)?.slaStartGameMs).toBe(sim.clock.gameMs);
    const view = sim.snapshot().orders.find((o) => o.id === later.id)!;
    expect(view.late).toBe(false);
    expect(view.slaRemainingMs).toBeGreaterThan(MS_PER_GAME_HOUR - 50);
  });

  it("still starts the hour at the bag rack when the player packs it themselves", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-2" });
    expect(order.slaDeferred).toBeUndefined();
    expect(order.slaStartGameMs).toBe(sim.clock.gameMs);
  });

  it("tells the driver what the counter is doing and what it has cleared", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    expect(sim.snapshot().shopCover.active).toBe(false);
    sendVanOut(sim);
    const idle = sim.snapshot().shopCover;
    expect(idle.active).toBe(true);
    expect(idle.line).toBe("Nobody waiting");
    expect(idle.served).toBe(0);

    const walk = sim.spawnOrder("inStore", { idMatches: true });
    sim.tick(50);
    const arriving = sim.snapshot().shopCover;
    expect(arriving.waiting).toBe(1);
    expect(arriving.line).toContain(walk.customerName);

    runCover(sim, () => sim.orderById(walk.id)?.status === "completed");
    const after = sim.snapshot().shopCover;
    expect(after.served).toBe(1);
    expect(after.waiting).toBe(0);
    expect(after.lost).toBe(0);
  });

  it("resets the cover tally on each new run", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    sendVanOut(sim);
    const walk = sim.spawnOrder("inStore", { idMatches: true });
    runCover(sim, () => sim.orderById(walk.id)?.status === "completed");
    expect(sim.snapshot().shopCover.served).toBe(1);

    const shop = tileToWorld(CITY.shopSpawn);
    sim.setVehiclePosition(shop.x, shop.y);
    expect(sim.backToShop()).toBe(true);
    expect(sim.snapshot().toast).toContain("1");
    fillTicket(sim, "delivery", { destinationId: "house-2" });
    expect(sim.hitTheRoad()).toBe(true);
    expect(sim.snapshot().shopCover.served).toBe(0);
  });
});

describe("recurring walk-in traffic", () => {
  interface DoorLog {
    /** Game time each walk-in was first seen on the floor, in spawn order. */
    spawnedAt: number[];
    ids: string[];
    /** Most walk-ins standing at the counter at any one sample. */
    maxAtOnce: number;
  }

  /**
   * Watch the front door for a whole shift. 500ms samples, not 50ms: a shift is 840s of
   * game time, and fine granularity here would run 16,800 ticks per test for no extra
   * signal — a walk-in lives ~21s, so nothing can slip between samples.
   */
  function watchDoor(sim: GameSim): DoorLog {
    const log: DoorLog = { spawnedAt: [], ids: [], maxAtOnce: 0 };
    const seen = new Set<string>();
    for (let t = 0; t < SHIFT_MS; t += 500) {
      sim.tick(500);
      const onFloor = sim.snapshot().orders.filter((o) => o.type === "inStore");
      log.maxAtOnce = Math.max(log.maxAtOnce, onFloor.length);
      for (const order of onFloor) {
        if (seen.has(order.id)) continue;
        seen.add(order.id);
        log.ids.push(order.id);
        log.spawnedAt.push(sim.clock.gameMs);
      }
    }
    return log;
  }

  function gapsBetween(times: number[]): number[] {
    return times.slice(1).map((t, i) => t - times[i]!);
  }

  it("keeps the door swinging all shift, not just at open", () => {
    const sim = GameSim.create({ seed: 3 });
    const log = watchDoor(sim);
    // ~14–28 walk-ins at the original 24–60s beat. The band is wide enough for any seed but far
    // above the single scripted walk-in that used to be the whole day's foot traffic.
    expect(log.ids.length).toBeGreaterThanOrEqual(12);
    expect(log.ids.length).toBeLessThanOrEqual(32);
    // Spread across the shift, not bunched into the opening.
    expect(log.spawnedAt[log.spawnedAt.length - 1]).toBeGreaterThan(SHIFT_MS * 0.8);
  });

  it("holds the door beat to its scaled walk-in window", () => {
    const sim = GameSim.create({ seed: 3 });
    const gaps = gapsBetween(watchDoor(sim).spawnedAt);
    // Skip opening→first-unscripted: that gap is FIRST_WALKIN_MS scripting, not WALKIN_GAP_*.
    const steady = gaps.slice(1);
    expect(steady.length).toBeGreaterThanOrEqual(9);
    // 500ms of slack each way for the sampling rate above.
    expect(Math.min(...steady)).toBeGreaterThanOrEqual(WALKIN_GAP_MIN_MS - 500);
    expect(Math.max(...steady)).toBeLessThanOrEqual(WALKIN_GAP_MAX_MS + 500);
  });

  it("never puts a second walk-in on the counter behind the first", () => {
    // Nobody serves anyone here, so every walk-in stands until they leave — the worst
    // case for stacking, and the one that proves the door waits for the spot to clear.
    const sim = GameSim.create({ seed: 5 });
    const log = watchDoor(sim);
    expect(log.maxAtOnce).toBe(1);
    expect(log.ids.length).toBeGreaterThanOrEqual(12);
  });

  it("puts a walk-in that arrives mid-run through the key lead's cover loop", () => {
    const sim = GameSim.create({ seed: 4 });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    expect(sim.hitTheRoad()).toBe(true);
    const walkInIds = () => sim.snapshot().orders.filter((o) => o.type === "inStore").map((o) => o.id);
    const atDeparture = new Set(walkInIds());
    const arrivals = () => walkInIds().filter((id) => !atDeparture.has(id));

    runCover(sim, () => arrivals().length > 0, 1_400);
    const arrival = arrivals()[0];
    expect(arrival).toBeDefined();
    const servedBefore = sim.snapshot().shopCover.served;

    runCover(sim, () => sim.orderById(arrival!)?.status === "completed", 400);
    expect(sim.orderById(arrival!)?.status).toBe("completed");
    expect(sim.snapshot().shopCover.served).toBeGreaterThan(servedBefore);
  });

  it("leaves the driver's banner alone when someone walks in behind them", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    expect(sim.hitTheRoad()).toBe(true);
    const banner = sim.snapshot().toast;
    expect(banner).not.toBe("");
    sim.spawnOrder("inStore", { idMatches: true });
    expect(sim.snapshot().toast).toBe(banner);
  });
});

describe("the key lead can be outrun by the counter", () => {
  /** Leave the van out with `bags` deliveries already packed and stacked on the counter. */
  function parkWithPile(sim: GameSim, bags: number): void {
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    expect(sim.hitTheRoad()).toBe(true);
    for (let i = 0; i < bags; i++) sim.spawnOrder("delivery", { idMatches: true });
    runCover(sim, () => sim.snapshot().shopCover.packed >= bags, 1_600);
    expect(sim.snapshot().shopCover.packed).toBe(bags);
  }

  it("covers a shallow counter at full speed, exactly as it always did", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    parkWithPile(sim, 2);
    const walk = sim.spawnOrder("inStore", { idMatches: true });
    runCover(sim, () => sim.orderById(walk.id)?.status !== "atRegister", 800);
    expect(sim.orderById(walk.id)?.status).toBe("completed");
    expect(sim.snapshot().shopCover.lost).toBe(0);
  });

  it("loses a walk-in when the counter is buried under undriven bags", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    parkWithPile(sim, 8);
    const walk = sim.spawnOrder("inStore", { idMatches: true });
    runCover(sim, () => sim.orderById(walk.id)?.status !== "atRegister", 800);
    expect(sim.orderById(walk.id)?.status).toBe("failed");
    expect(sim.snapshot().shopCover.lost).toBe(1);
  });

  it("tells the driver who is waiting, how deep, and who just left", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    parkWithPile(sim, 8);
    const walk = sim.spawnOrder("inStore", { idMatches: true });

    // While they are too deep to look up, the readout names the person and the pile.
    runCover(sim, () => sim.snapshot().shopCover.line.startsWith("Buried"), 400);
    const waiting = sim.snapshot().shopCover.line;
    expect(waiting).toContain(walk.customerName);
    expect(waiting).toMatch(/Buried — \d+ jobs/);

    // The moment they give up, the readout says so by name and the tally ticks over.
    runCover(sim, () => sim.snapshot().shopCover.lost > 0, 800);
    expect(sim.snapshot().shopCover.line).toBe(`${walk.customerName} gave up and left`);
    expect(sim.snapshot().shopCover.lost).toBe(1);
  });

  it("holds a normal delivery run cleanly and only sheds once parked for good", () => {
    const sim = GameSim.create({ seed: 8 });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    expect(sim.hitTheRoad()).toBe(true);

    // 90s out is a normal round trip. Nobody should pay for that.
    for (let t = 0; t < 90_000; t += 500) sim.tick(500);
    expect(sim.snapshot().shopCover.lost).toBe(0);
    expect(sim.snapshot().shopCover.served).toBeGreaterThan(0);

    // Five more minutes with nobody running the bags out and the pile wins.
    for (let t = 0; t < 300_000; t += 500) sim.tick(500);
    expect(sim.snapshot().shopCover.lost).toBeGreaterThan(0);
  });

  it("leaves an abandoned shift scoring no better than nothing", () => {
    const sim = GameSim.create({ seed: 8 });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    expect(sim.hitTheRoad()).toBe(true);
    for (let t = 0; t < SHIFT_MS; t += 500) sim.tick(500);

    const cover = sim.snapshot().shopCover;
    // The key lead is good early on — this is a shift going bad, not a broken employee.
    expect(cover.served).toBeGreaterThanOrEqual(4);
    expect(cover.lost).toBeGreaterThan(cover.served);
    // With the slower door beat the cover still nets losses: score stays below a clean serve tally.
    expect(sim.score).toBeLessThan(cover.served * SCORE_INSTORE);
  });
});

describe("resetting the day returns a cold start", () => {
  /**
   * Leave the shop in the worst state a player could hand it over in: a walk-in standing
   * at the counter, a pickup on the shelf, packed bags in the bin, an unpacked ticket on
   * the tablet, the van out on a multi-stop run, and a dropoff mid-flow at a door.
   */
  function makeMessy(sim: GameSim): { walkInId: string } {
    fillTicket(sim, "pickup");
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    fillTicket(sim, "delivery", { destinationId: "house-4" });
    sim.spawnOrder("delivery", { destinationId: "house-7", idMatches: true });

    expect(sim.hitTheRoad()).toBe(true);
    for (let i = 0; i < 1_500 && sim.snapshot().autoDriving; i++) sim.tick(50);
    if (sim.snapshot().dropoff.phase === "atCurb") {
      stepDropoff(sim);
      sim.tick(CALL_CONNECT_MS + 32);
      stepDropoff(sim);
    }

    // Spawned last and walked only as far as the counter, so they cannot time out first.
    const walkIn = sim.spawnOrder("inStore", { idMatches: true });
    waitForCustomerAtCounter(sim, walkIn.id);
    return { walkInId: walkIn.id };
  }

  /**
   * Fields that legitimately differ from a brand-new sim, each for a stated reason. Kept
   * deliberately short: anything not named here must come back at its cold-start value.
   * A reset hands the player a *new* day rather than a rerun of the old one, which is why
   * the name stream advances — the seeded `rng` advances with it, and being a per-instance
   * closure it is compared by shape below rather than by identity.
   */
  const CARRIES_OVER = new Set([
    "toast", // names the reset instead of welcoming the player
    "ordersNotice", // names the reset on ORDERS instead of welcoming
    "nameSeed", // a new day brings new customers, not yesterday's again
    "scoreFlashSeq", // monotonic UI event id the HUD dedupes against its last-seen id
    "sfxSeq", // likewise for the sound cue
    "trafficCacheMs", // per-step drive cache — not shift state
    "trafficCache",
  ]);

  /** Every own field of the sim, plus the clock, which lives behind a GameClock. */
  function fields(sim: GameSim): Record<string, unknown> {
    const bag: Record<string, unknown> = { "clock.gameMs": sim.clock.gameMs };
    for (const key of Object.keys(sim)) {
      if (CARRIES_OVER.has(key)) continue;
      const value = (sim as unknown as Record<string, unknown>)[key];
      // Closures are never reference-equal across instances. Recording the type still
      // fails if a function field goes missing or stops being a function.
      bag[key] = typeof value === "function" ? "fn" : value;
    }
    return bag;
  }

  /**
   * The regression guard. Reflective on purpose: it reads the sim's own field list, so a
   * field added by a future feature is covered without anyone remembering to add it here.
   * A reset written as a list of assignments drifts; this fails the moment it does.
   */
  it.each([
    ["resetToMorning", (sim: GameSim) => sim.resetToMorning()],
    ["startNewDay", (sim: GameSim) => sim.startNewDay()],
  ])("leaves no field behind after %s", (_label, reset) => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    makeMessy(sim);
    reset(sim);
    // Sanity-check the mess was real before trusting the comparison that follows.
    expect(Object.keys(fields(sim)).length).toBeGreaterThan(20);
    expect(fields(sim)).toEqual(fields(GameSim.create({ seed: 4, autoSpawn: false })));
  });

  it("clears a walk-in left standing on the shop floor — the reported case", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const { walkInId } = makeMessy(sim);
    // The customer is genuinely on the floor, not merely queued as an order.
    expect(sim.snapshot().customers.some((c) => c.orderId === walkInId)).toBe(true);

    sim.resetToMorning();

    // ShopScene reconciles its sprites against this list every frame and destroys any it
    // no longer finds, so an empty list here is what removes the stranded customer.
    expect(sim.snapshot().customers).toEqual([]);
    expect(sim.orderById(walkInId)).toBeUndefined();
  });

  it("empties the tablet, the bin, the shelf and the run", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    makeMessy(sim);
    const before = sim.snapshot();
    expect(before.tabletQueueCount + before.bagsInBin.length + before.bagsOnPickup.length).toBeGreaterThan(0);
    expect(before.run).not.toBeNull();

    sim.resetToMorning();

    const after = sim.snapshot();
    expect(after.orders).toEqual([]);
    expect(after.tabletQueueCount).toBe(0);
    expect(after.tabletTicket).toBeNull();
    expect(after.bagsInBin).toEqual([]);
    expect(after.bagsOnPickup).toEqual([]);
    expect(after.run).toBeNull();
    expect(after.dropoff.phase).toBe("none");
    expect(after.playerRole).toBe("keyLead");
    expect(after.handSkuId).toBeNull();
    expect(after.selectedOrderId).toBeNull();
    expect(after.clockLabel).toBe("09:00");
    expect(after.score).toBe(0);
  });

  it("zeroes the counter-cover tallies, so the next run starts from nothing", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    expect(sim.hitTheRoad()).toBe(true);
    for (let i = 0; i < 6; i++) sim.spawnOrder("delivery", { idMatches: true });
    sim.spawnOrder("inStore", { idMatches: true });
    runCover(sim, () => sim.snapshot().shopCover.lost > 0, 1_600);

    const busy = sim.snapshot().shopCover;
    expect(busy.packed + busy.served + busy.lost).toBeGreaterThan(0);

    sim.resetToMorning();

    expect(sim.snapshot().shopCover).toEqual({
      active: false,
      line: "Nobody waiting",
      waiting: 0,
      packed: 0,
      served: 0,
      lost: 0,
    });
  });

  it("restarts the walk-in and ticket-wave timers instead of firing them instantly", () => {
    const sim = GameSim.create({ seed: 4 });
    for (let t = 0; t < 200_000; t += 500) sim.tick(500);
    sim.resetToMorning();
    expect(sim.snapshot().orders).toEqual([]);

    // A reset must not dump the backlog of every wave the old clock had already passed.
    sim.tick(50);
    expect(sim.snapshot().orders.length).toBeLessThanOrEqual(1);
  });

  it("comes back playable after ending the shift early", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    fillTicket(sim, "inStore");
    expect(sim.snapshot().canEndShiftEarly).toBe(true);
    expect(sim.endShiftEarly()).toBe(true);
    expect(sim.snapshot().shiftEnded).toBe(true);

    sim.resetToMorning();

    const snap = sim.snapshot();
    expect(snap.shiftEnded).toBe(false);
    expect(snap.shiftResults).toBeNull();
    expect(snap.canEndShiftEarly).toBe(false);
    expect(snap.score).toBe(0);
    // Playable, not frozen: the sim still advances and still accepts a sale.
    sim.tick(100);
    expect(sim.snapshot().clockLabel).toBe("09:00");
    fillTicket(sim, "inStore");
    expect(sim.score).toBe(SCORE_INSTORE);
  });

  it("exposes rolePhase without building a snapshot", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    expect(sim.rolePhase()).toEqual({ role: "keyLead", dropoffPhase: null });
  });

  it("keeps customer bubble copy across motion ticks when bubble inputs are unchanged", () => {
    const sim = GameSim.create({ seed: 8, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    sim.shopClick({ type: "tablet", orderId: order.id });
    sim.shopClick({ type: "item", skuId: order.skuId });
    waitForFetch(sim);
    sim.shopClick({ type: "bagRack" });
    waitForCustomerAtCounter(sim, order.id);
    const before = sim.snapshot().customers.find((c) => c.orderId === order.id)?.bubble;
    expect(before).toBeTruthy();
    sim.tick(32);
    const after = sim.snapshot().customers.find((c) => c.orderId === order.id)?.bubble;
    expect(after).toBe(before);
  });

  it("puts the tutorial back on its first step", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    makeMessy(sim);
    // Mid-run the hint points at the doorstep, not at the shop floor.
    expect(tutorialHints(sim.snapshot())[0]?.kind).not.toBe("tablet");

    sim.resetToMorning();

    // Nothing to do on an empty floor, and the first ticket draws the hint back to the
    // tablet — the same first step a player sees on a cold start.
    expect(tutorialHints(sim.snapshot())).toEqual([]);
    const fresh = sim.spawnOrder("pickup", { idMatches: true });
    expect(tutorialHints(sim.snapshot())).toEqual([
      expect.objectContaining({ kind: "tablet", orderId: fresh.id }),
    ]);
  });
});
