/**
 * Audit harness: scripted GameSim passes for aesthetics/gameplay audit.
 * Run: npx tsx scripts/audit-loops.ts
 */
import {
  CALL_CONNECT_MS,
  INSTORE_WALKOUT_MS,
  MS_PER_GAME_HOUR,
  NPC_INTERACT_COOLDOWN_MS,
  PICKUP_ARRIVE_MS,
  SCORE_DELIVERY_LATE,
  SCORE_DELIVERY_ON_TIME,
  SCORE_FAIL,
  SCORE_INSTORE,
  SCORE_PICKUP,
  SHIFT_MS,
} from "../src/sim/constants";
import { GameSim } from "../src/sim/gameSim";
import { tutorialHints } from "../src/sim/tutorialHints";
import { houseById, tileToWorld } from "../src/maps/cityT0";

type Row = { pass: string; ok: boolean; note: string };
const rows: Row[] = [];

function rec(pass: string, ok: boolean, note: string): void {
  rows.push({ pass, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${pass}: ${note}`);
}

function waitFetch(sim: GameSim): void {
  for (let i = 0; i < 240; i++) {
    if (sim.snapshot().keyLead.phase === "idle" && sim.snapshot().handSkuId) return;
    sim.tick(50);
  }
}

function waitCounter(sim: GameSim, orderId: string): void {
  for (let i = 0; i < 240; i++) {
    if (sim.orderById(orderId)?.arriveAtGameMs !== undefined) return;
    sim.tick(50);
  }
}

function stepDoor(sim: GameSim): void {
  sim.interact();
  sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
}

function fillInStore(sim: GameSim): string {
  const order = sim.spawnOrder("inStore");
  waitCounter(sim, order.id);
  sim.shopClick({ type: "item", skuId: order.skuId });
  waitFetch(sim);
  sim.shopClick({ type: "customer", orderId: order.id });
  return order.id;
}

function fillTicket(
  sim: GameSim,
  type: "pickup" | "delivery",
  extra?: { destinationId?: string; idMatches?: boolean },
) {
  const order = sim.spawnOrder(type, { ...extra, idMatches: extra?.idMatches ?? true });
  sim.shopClick({ type: "tablet", orderId: order.id });
  sim.shopClick({ type: "item", skuId: order.skuId });
  waitFetch(sim);
  sim.shopClick({ type: "bagRack" });
  return order;
}

function finishDoor(sim: GameSim, houseId: string): void {
  const stop = houseById(houseId)!;
  const pos = tileToWorld(stop.stop);
  sim.setVehiclePosition(pos.x, pos.y);
  sim.tick(32);
  stepDoor(sim);
  sim.tick(CALL_CONNECT_MS + 32);
  stepDoor(sim); // ask
  stepDoor(sim); // check
  stepDoor(sim); // bag
  stepDoor(sim); // photo
}

// Pass 1: counter sale → end shift → new day
{
  const sim = GameSim.create({ seed: 2, autoSpawn: false });
  fillInStore(sim);
  const hintsOk = tutorialHints(sim.snapshot()).length === 0 || true;
  rec("1-counter-sale", sim.score === SCORE_INSTORE && sim.snapshot().scoreFlash?.delta === SCORE_INSTORE, `score=${sim.score} flash=${sim.snapshot().scoreFlash?.delta}`);
  rec("1-end-shift", sim.endShiftEarly() && sim.snapshot().shiftEnded, `results=${sim.snapshot().shiftResults?.breakdown.inStore}`);
  sim.startNewDay();
  rec("1-new-day", sim.snapshot().clockLabel === "09:00" && sim.score === 0 && !sim.snapshot().shiftEnded, `clock=${sim.snapshot().clockLabel}`);
  void hintsOk;
}

// Pass 2: pickup
{
  const sim = GameSim.create({ seed: 1, autoSpawn: false });
  const order = fillTicket(sim, "pickup");
  sim.tick(PICKUP_ARRIVE_MS);
  for (let i = 0; i < 80; i++) sim.tick(50);
  sim.shopClick({ type: "handoff" });
  // handoff via customer click
  const cust = sim.snapshot().customers.find((c) => c.orderId === order.id);
  if (cust) sim.shopClick({ type: "customer", orderId: order.id });
  else {
    // readyForHandoff path
    for (let i = 0; i < 40; i++) {
      sim.tick(50);
      const o = sim.orderById(order.id);
      if (o?.status === "readyForHandoff" || o?.status === "completed") break;
    }
    if (sim.orderById(order.id)?.status !== "completed") {
      sim.shopClick({ type: "customer", orderId: order.id });
    }
  }
  rec("2-pickup", sim.orderById(order.id)?.status === "completed" && sim.score === SCORE_PICKUP, `status=${sim.orderById(order.id)?.status} score=${sim.score}`);
}

// Pass 3: single delivery, matching ID
{
  const sim = GameSim.create({ seed: 4, autoSpawn: false });
  const order = fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: true });
  sim.hitTheRoad();
  finishDoor(sim, "house-1");
  rec(
    "3-delivery-ontime",
    sim.orderById(order.id)?.status === "completed" && sim.score === SCORE_DELIVERY_ON_TIME,
    `status=${sim.orderById(order.id)?.status} score=${sim.score} toast=${sim.snapshot().toast.slice(0, 60)}`,
  );
}

// Pass 4: mismatched ID
{
  const sim = GameSim.create({ seed: 4, autoSpawn: false });
  const order = fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: false });
  sim.hitTheRoad();
  const stop = houseById("house-1")!;
  const pos = tileToWorld(stop.stop);
  sim.setVehiclePosition(pos.x, pos.y);
  sim.tick(32);
  stepDoor(sim);
  sim.tick(CALL_CONNECT_MS + 32);
  stepDoor(sim); // ask
  stepDoor(sim); // check deny
  rec(
    "4-id-mismatch",
    sim.orderById(order.id)?.status === "failed" && sim.score === SCORE_FAIL && (sim.snapshot().shiftResults === null),
    `status=${sim.orderById(order.id)?.status} score=${sim.score} toast=${sim.snapshot().toast.slice(0, 70)}`,
  );
  rec("4-id-mismatch-flash", sim.snapshot().scoreFlash?.delta === SCORE_FAIL, `flash=${sim.snapshot().scoreFlash?.delta}`);
}

// Pass 5: multi-stop
{
  const sim = GameSim.create({ seed: 7, autoSpawn: false });
  const a = fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: true });
  const b = fillTicket(sim, "delivery", { destinationId: "house-2", idMatches: true });
  sim.hitTheRoad();
  finishDoor(sim, "house-1");
  const mid = sim.orderById(a.id)?.status === "completed" && sim.orderById(b.id)?.status === "onRun";
  finishDoor(sim, "house-2");
  rec(
    "5-multistop",
    mid && sim.orderById(b.id)?.status === "completed" && sim.score === SCORE_DELIVERY_ON_TIME * 2,
    `a=${sim.orderById(a.id)?.status} b=${sim.orderById(b.id)?.status} score=${sim.score}`,
  );
}

// Pass 6: late delivery
{
  const sim = GameSim.create({ seed: 4, autoSpawn: false });
  const order = fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: true });
  sim.hitTheRoad();
  sim.tick(MS_PER_GAME_HOUR + 50);
  finishDoor(sim, "house-1");
  rec(
    "6-late",
    sim.orderById(order.id)?.late === true && sim.score === SCORE_DELIVERY_LATE,
    `late=${sim.orderById(order.id)?.late} score=${sim.score} toast=${sim.snapshot().toast.slice(0, 70)}`,
  );
}

// Pass 7: 23:00 mid-door
{
  const sim = GameSim.create({ seed: 4, autoSpawn: false });
  fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: true });
  sim.hitTheRoad();
  const stop = houseById("house-1")!;
  const pos = tileToWorld(stop.stop);
  sim.setVehiclePosition(pos.x, pos.y);
  sim.tick(32);
  stepDoor(sim);
  sim.tick(CALL_CONNECT_MS + 32);
  stepDoor(sim); // at door ASK ID
  rec("7-pre-shift-end", sim.snapshot().dropoff.phase === "atDoor", `phase=${sim.snapshot().dropoff.phase}`);
  sim.tick(SHIFT_MS);
  rec(
    "7-mid-door-23",
    sim.snapshot().shiftEnded && sim.snapshot().dropoff.phase === "none" && !!sim.snapshot().shiftResults,
    `ended=${sim.snapshot().shiftEnded} door=${sim.snapshot().dropoff.phase}`,
  );
}

// Pass 8: wrong TV
{
  const sim = GameSim.create({ seed: 2, autoSpawn: false });
  const order = sim.spawnOrder("inStore");
  waitCounter(sim, order.id);
  const other = sim.catalog.find((s) => s.id !== order.skuId)!;
  sim.shopClick({ type: "item", skuId: other.id });
  waitFetch(sim);
  const before = sim.score;
  sim.shopClick({ type: "customer", orderId: order.id });
  rec(
    "8-wrong-tv",
    sim.orderById(order.id)?.status === "atRegister" && sim.score === before && /Wrong|wants/i.test(sim.snapshot().toast),
    `toast=${sim.snapshot().toast}`,
  );
}

// Pass 9: dual-flash risk — packed bags + walk-in
{
  const sim = GameSim.create({ seed: 2, autoSpawn: false });
  fillTicket(sim, "delivery", { destinationId: "house-1" });
  const walk = sim.spawnOrder("inStore");
  waitCounter(sim, walk.id);
  const hint = tutorialHints(sim.snapshot())[0];
  const canGo = sim.snapshot().canHitTheRoad;
  rec(
    "9-hint-vs-driver-flash",
    hint?.kind === "item" || hint?.kind === "customer",
    `hint=${hint?.kind} canHitTheRoad=${canGo} (ShopScene flashes driver whenever canGo — dual flash risk)`,
  );
}

// Pass 10: counterBag / receipt / pad dead surfaces
{
  const sim = GameSim.create({ seed: 1, autoSpawn: false });
  fillTicket(sim, "pickup");
  const snap = sim.snapshot();
  rec("10-counterBag-view-null", snap.counterBag === null, "pack seals immediately; packBag sprite forced invisible in ShopScene");
  sim.shopClick({ type: "receipt" });
  rec("10-receipt-stub", /No receipt|pack bags/i.test(sim.snapshot().toast), `toast=${sim.snapshot().toast}`);
}

// Hint kind coverage
{
  const kinds = new Set([
    "item",
    "bagRack",
    "tablet",
    "customer",
    "hitTheRoad",
    "phone",
    "idCard",
    "doorCustomer",
    "handoff",
    "gpsPin",
    "shop",
  ]);
  const neverEmitted = ["counterBag"];
  rec("hint-counterBag-dead", true, `kind counterBag exists in TutorialHint union but nextShopHint never returns it`);
  rec("hint-gpsPin-no-flash", true, `gpsPin emitted when parked off-route; DriveScene does not tint pin for gpsPin kind`);
  void kinds;
  void neverEmitted;
}

const failed = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} audit checks passed`);
if (failed.length) process.exitCode = 1;
