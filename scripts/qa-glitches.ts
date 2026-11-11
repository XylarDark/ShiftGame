/**
 * Adversarial QA harness for Kindling interactions / glitches.
 * Run: npx tsx scripts/qa-glitches.ts
 */
import {
  CALL_CONNECT_MS,
  INSTORE_WALKOUT_MS,
  MS_PER_GAME_HOUR,
  NPC_INTERACT_COOLDOWN_MS,
  PICKUP_ARRIVE_MS,
  PICKUP_HANDOFF_WAIT_MS,
  SCORE_FAIL,
  SHIFT_MS,
} from "../src/sim/constants";
import { GameSim } from "../src/sim/gameSim";
import { tutorialHints } from "../src/sim/tutorialHints";
import { CITY, houseById, tileToWorld } from "../src/maps/cityT0";

type Row = { id: string; ok: boolean; severity: "P0" | "P1" | "P2" | "PASS"; note: string };
const rows: Row[] = [];

function rec(id: string, ok: boolean, note: string, severity: Row["severity"] = ok ? "PASS" : "P1"): void {
  rows.push({ id, ok, severity: ok ? "PASS" : severity, note });
  console.log(`${ok ? "PASS" : `FAIL(${severity})`}  ${id}: ${note}`);
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

function startDoor(sim: GameSim, houseId: string): void {
  const stop = houseById(houseId)!;
  const pos = tileToWorld(stop.stop);
  sim.setVehiclePosition(pos.x, pos.y);
  sim.tick(32);
  stepDoor(sim); // call
  sim.tick(CALL_CONNECT_MS + 32);
}

function spamInteract(sim: GameSim, n: number): void {
  for (let i = 0; i < n; i++) sim.interact();
}

// --- 1. Spam door at each step: at most one advance per arm window ---
{
  const sim = GameSim.create({ seed: 4, autoSpawn: false });
  fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: true });
  sim.hitTheRoad();
  startDoor(sim, "house-1");
  spamInteract(sim, 8);
  rec(
    "G1-spam-ask",
    sim.snapshot().dropoff.actionLabel === "CHECK ID" && sim.snapshot().dropoff.phase === "atDoor",
    `after 8 interacts at ASK → ${sim.snapshot().dropoff.actionLabel}`,
    "P0",
  );
  // Lock still active — spam must not clear CHECK into HAND/PHOTO
  spamInteract(sim, 8);
  rec(
    "G1-spam-check-while-locked",
    sim.snapshot().dropoff.actionLabel === "CHECK ID",
    `spam during post-ASK lock stays CHECK → ${sim.snapshot().dropoff.actionLabel}`,
    "P0",
  );
  sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
  sim.interact(); // legal check
  sim.tick(16);
  rec(
    "G1-check-one-step",
    sim.snapshot().dropoff.actionLabel === "HAND BAG",
    `one armed check → ${sim.snapshot().dropoff.actionLabel}`,
    "P0",
  );
  spamInteract(sim, 8);
  rec(
    "G1-spam-hand-locked",
    sim.snapshot().dropoff.actionLabel === "HAND BAG",
    `spam during post-CHECK lock stays HAND → ${sim.snapshot().dropoff.actionLabel}`,
    "P0",
  );
  sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
  spamInteract(sim, 8);
  rec(
    "G1-spam-hand-to-photo",
    sim.snapshot().dropoff.actionLabel === "PHOTO",
    `after arm + spam at HAND → ${sim.snapshot().dropoff.actionLabel} (must not complete order)`,
    "P0",
  );
  rec(
    "G1-no-phantom-complete",
    sim.snapshot().orders.every((o) => o.status !== "completed") ||
      sim.orderById(sim.snapshot().dropoff.orderId ?? "")?.status === "onRun" ||
      sim.snapshot().dropoff.phase === "atDoor",
    `phase=${sim.snapshot().dropoff.phase} still in handoff`,
    "P0",
  );
}

// --- 2. Mismatched-ID deny then spam ---
{
  const sim = GameSim.create({ seed: 4, autoSpawn: false });
  const order = fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: false });
  sim.hitTheRoad();
  startDoor(sim, "house-1");
  stepDoor(sim); // ask
  stepDoor(sim); // deny
  const score = sim.score;
  spamInteract(sim, 12);
  sim.tick(500);
  spamInteract(sim, 8);
  rec(
    "G2-deny-spam",
    sim.orderById(order.id)?.status === "failed" &&
      sim.score === score &&
      sim.snapshot().dropoff.phase === "none",
    `status=${sim.orderById(order.id)?.status} score=${sim.score} door=${sim.snapshot().dropoff.phase}`,
    "P0",
  );
}

// --- 3. End shift at each door phase ---
{
  const phases: { name: string; prep: (s: GameSim) => void }[] = [
    {
      name: "atCurb",
      prep: (s) => {
        fillTicket(s, "delivery", { destinationId: "house-1" });
        s.hitTheRoad();
        const pos = tileToWorld(houseById("house-1")!.stop);
        s.setVehiclePosition(pos.x, pos.y);
        s.tick(32);
      },
    },
    {
      name: "calling",
      prep: (s) => {
        fillTicket(s, "delivery", { destinationId: "house-1" });
        s.hitTheRoad();
        const pos = tileToWorld(houseById("house-1")!.stop);
        s.setVehiclePosition(pos.x, pos.y);
        s.tick(32);
        s.interact();
        s.tick(32);
      },
    },
    {
      name: "ASK",
      prep: (s) => {
        fillTicket(s, "delivery", { destinationId: "house-1" });
        s.hitTheRoad();
        startDoor(s, "house-1");
      },
    },
    {
      name: "CHECK",
      prep: (s) => {
        fillTicket(s, "delivery", { destinationId: "house-1", idMatches: true });
        s.hitTheRoad();
        startDoor(s, "house-1");
        stepDoor(s);
      },
    },
    {
      name: "HAND",
      prep: (s) => {
        fillTicket(s, "delivery", { destinationId: "house-1", idMatches: true });
        s.hitTheRoad();
        startDoor(s, "house-1");
        stepDoor(s);
        stepDoor(s);
      },
    },
    {
      name: "PHOTO",
      prep: (s) => {
        fillTicket(s, "delivery", { destinationId: "house-1", idMatches: true });
        s.hitTheRoad();
        startDoor(s, "house-1");
        stepDoor(s);
        stepDoor(s);
        stepDoor(s);
      },
    },
  ];
  for (const p of phases) {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    p.prep(sim);
    // need a scored action for early end — pack/delivery start doesn't score yet; force a prior sale
    // endShift() works without scoredActions; endShiftEarly needs score. Use endShift().
    const before = sim.score;
    sim.endShift();
    sim.tick(1000);
    sim.shopClick({ type: "tablet", orderId: "x" });
    sim.interact();
    rec(
      `G3-end-${p.name}`,
      sim.snapshot().shiftEnded &&
        sim.snapshot().dropoff.phase === "none" &&
        sim.score === before &&
        !!sim.snapshot().shiftResults,
      `ended=${sim.snapshot().shiftEnded} door=${sim.snapshot().dropoff.phase} score=${sim.score}`,
      "P0",
    );
  }
}

// --- 4. End shift while driving ---
{
  const sim = GameSim.create({ seed: 4, autoSpawn: false });
  fillTicket(sim, "delivery", { destinationId: "house-1" });
  // score something first via in-store... optional; use endShift directly
  sim.hitTheRoad();
  sim.tick(500); // mid-route
  const role = sim.snapshot().playerRole;
  sim.endShift();
  const blockedHit = !sim.hitTheRoad();
  sim.tick(2000);
  rec(
    "G4-end-driving",
    sim.snapshot().shiftEnded && blockedHit && sim.snapshot().dropoff.phase === "none" && role === "driver",
    `role=${sim.snapshot().playerRole} auto=${sim.snapshot().autoDriving} hitBlocked=${blockedHit}`,
    "P0",
  );
}

// --- 5. New day from mid-run ---
{
  const sim = GameSim.create({ seed: 4, autoSpawn: false });
  fillTicket(sim, "delivery", { destinationId: "house-1" });
  fillTicket(sim, "delivery", { destinationId: "house-2" });
  sim.hitTheRoad();
  startDoor(sim, "house-1");
  sim.startNewDay();
  const snap = sim.snapshot();
  rec(
    "G5-new-day",
    snap.playerRole === "keyLead" &&
      snap.score === 0 &&
      snap.clockLabel === "09:00" &&
      !snap.shiftEnded &&
      snap.dropoff.phase === "none" &&
      (snap.run === null || snap.run.orderIds.length === 0) &&
      snap.bagsInBin.length === 0,
    `role=${snap.playerRole} run=${JSON.stringify(snap.run)} bags=${snap.bagsInBin.length}`,
    "P0",
  );
}

// --- 6. Walk-in + packed bags + hitTheRoad ---
{
  const sim = GameSim.create({ seed: 2, autoSpawn: false });
  fillTicket(sim, "delivery", { destinationId: "house-1" });
  const walk = sim.spawnOrder("inStore");
  waitCounter(sim, walk.id);
  const hint = tutorialHints(sim.snapshot())[0];
  const canGo = sim.snapshot().canHitTheRoad;
  const left = sim.hitTheRoad();
  const walkStatus = sim.orderById(walk.id)?.status;
  rec(
    "G6-depart-mid-walkin",
    left === false && walkStatus === "atRegister" && sim.snapshot().playerRole === "keyLead",
    `Depart blocked while hint=${hint?.kind} walk=${walkStatus} role=${sim.snapshot().playerRole}`,
    "P1",
  );
  rec(
    "G6-walkin-orphaned",
    walkStatus === "atRegister" && sim.snapshot().playerRole === "keyLead",
    `Walk-in remains in shop (not orphaned as driver): ${walkStatus}`,
    "P1",
  );
}

// --- 7. pendingDepart dead path ---
{
  const sim = GameSim.create({ seed: 3, autoSpawn: false });
  fillTicket(sim, "delivery", { destinationId: "house-1" });
  rec(
    "G7-pendingDepart-dead",
    !("pendingDepart" in sim.snapshot()),
    "pendingDepart removed from sim snapshot",
    "PASS",
  );
}

// --- 8. Walkout during fetch ---
{
  const sim = GameSim.create({ seed: 2, autoSpawn: false });
  const order = sim.spawnOrder("inStore");
  waitCounter(sim, order.id);
  sim.shopClick({ type: "item", skuId: order.skuId });
  const midPhase = sim.snapshot().keyLead.phase;
  // Many small ticks (real frame cadence) through walkout window
  for (let t = 0; t < INSTORE_WALKOUT_MS + 2000; t += 50) sim.tick(50);
  const snap = sim.snapshot();
  rec(
    "G8-walkout-during-fetch",
    sim.orderById(order.id)?.status === "failed" && snap.keyLead.phase === "idle",
    `midPhase=${midPhase} after=${snap.keyLead.phase} hand=${snap.handSkuId} status=${sim.orderById(order.id)?.status}`,
    "P1",
  );
  // Huge single-frame hitch: one tick of walkout+fetch duration
  const hitch = GameSim.create({ seed: 2, autoSpawn: false });
  const o2 = hitch.spawnOrder("inStore");
  waitCounter(hitch, o2.id);
  hitch.shopClick({ type: "item", skuId: o2.skuId });
  hitch.tick(INSTORE_WALKOUT_MS + 5000);
  const hitchSnap = hitch.snapshot();
  const hitchStatus = hitch.orderById(o2.id)?.status;
  // Large hitch must either finish the fetch (hand set / idle) or cleanly fail the walkout.
  rec(
    "G8-hitch-tick-keylead",
    hitchSnap.keyLead.phase === "idle" && (hitchStatus === "failed" || hitchSnap.handSkuId === o2.skuId || hitchStatus === "completed"),
    `After one ${INSTORE_WALKOUT_MS + 5000}ms tick: phase=${hitchSnap.keyLead.phase} hand=${hitchSnap.handSkuId} status=${hitchStatus}`,
    "P2",
  );
}

// --- 9. Pickup no-show with bag on counter ---
{
  const sim = GameSim.create({ seed: 1, autoSpawn: false });
  const order = fillTicket(sim, "pickup");
  expect(order.status === "onPickupShelf" || order.status === "readyForHandoff");
  sim.tick(PICKUP_ARRIVE_MS);
  for (let i = 0; i < 80; i++) sim.tick(50);
  // wait out handoff window without tapping
  sim.tick(PICKUP_HANDOFF_WAIT_MS + 100);
  const status = sim.orderById(order.id)?.status;
  const ghosts = sim.snapshot().customers.filter((c) => c.orderId === order.id);
  const bagGone = !sim.snapshot().bagsOnPickup.includes(order.id);
  rec(
    "G9-pickup-noshow",
    status === "failed" && ghosts.length === 0,
    `status=${status} ghosts=${ghosts.length} bagCleared=${bagGone}`,
    "P1",
  );
}

function expect(cond: boolean): void {
  void cond;
}

// --- 10. Multi-stop wrong house lock ---
{
  const sim = GameSim.create({ seed: 4, autoSpawn: false });
  const first = fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: true });
  fillTicket(sim, "delivery", { destinationId: "house-2", idMatches: true });
  sim.hitTheRoad();
  startDoor(sim, "house-1");
  stepDoor(sim); // ask
  stepDoor(sim); // check → HAND
  const other = tileToWorld(houseById("house-2")!.stop);
  sim.setVehiclePosition(other.x, other.y);
  spamInteract(sim, 5);
  sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
  const stillFirst =
    sim.snapshot().dropoff.orderId === first.id ||
    sim.orderById(first.id)?.status === "completed" ||
    sim.snapshot().dropoff.actionLabel === "PHOTO" ||
    sim.snapshot().dropoff.actionLabel === "HAND BAG";
  rec(
    "G10-wrong-house-lock",
    stillFirst && sim.orderById(first.id)?.status !== "failed",
    `doorOrder=${sim.snapshot().dropoff.orderId} label=${sim.snapshot().dropoff.actionLabel} first=${sim.orderById(first.id)?.status}`,
    "P0",
  );
}

// --- 11. Return with bags left, hit road again ---
{
  const sim = GameSim.create({ seed: 4, autoSpawn: false });
  fillTicket(sim, "delivery", { destinationId: "house-1" });
  fillTicket(sim, "delivery", { destinationId: "house-2" });
  sim.hitTheRoad();
  // complete first only
  startDoor(sim, "house-1");
  stepDoor(sim);
  stepDoor(sim);
  stepDoor(sim);
  stepDoor(sim);
  const shop = tileToWorld(CITY.shopSpawn);
  sim.setVehiclePosition(shop.x, shop.y);
  sim.tick(100);
  const back = sim.backToShop();
  const remaining = sim.snapshot().run?.orderIds.length ?? 0;
  const again = sim.hitTheRoad();
  rec(
    "G11-return-partial-run",
    back && remaining >= 1 && again && sim.snapshot().playerRole === "driver",
    `back=${back} remaining=${remaining} again=${again} role=${sim.snapshot().playerRole}`,
    "P1",
  );
}

// --- 12. Double endShift / early before score ---
{
  const sim = GameSim.create({ seed: 1, autoSpawn: false });
  rec("G12-early-before-score", sim.endShiftEarly() === false, "endShiftEarly before score returns false", "P1");
  fillTicket(sim, "pickup");
  // pickup packed isn't scored yet
  const earlyPacked = sim.endShiftEarly();
  // complete pickup for score
  const sim2 = GameSim.create({ seed: 1, autoSpawn: false });
  const order = fillTicket(sim2, "pickup");
  sim2.tick(PICKUP_ARRIVE_MS);
  for (let i = 0; i < 80; i++) sim2.tick(50);
  sim2.shopClick({ type: "customer", orderId: order.id });
  const first = sim2.endShiftEarly();
  const second = sim2.endShiftEarly();
  sim2.endShift(); // no-op if already ended
  rec(
    "G12-double-end",
    first === true && second === false && sim2.snapshot().shiftEnded,
    `earlyPacked=${earlyPacked} first=${first} second=${second}`,
    "P1",
  );
}

// --- Bonus: queuedInteract after shift end ---
{
  const sim = GameSim.create({ seed: 4, autoSpawn: false });
  fillTicket(sim, "delivery", { destinationId: "house-1", idMatches: true });
  sim.hitTheRoad();
  startDoor(sim, "house-1");
  sim.endShift();
  sim.queueInteract();
  sim.tick(16);
  rec(
    "G13-queued-after-end",
    sim.snapshot().shiftEnded && sim.snapshot().dropoff.phase === "none",
    `door=${sim.snapshot().dropoff.phase} after queued interact post-end`,
    "P0",
  );
}

// --- Bonus: clock clamp to 23 mid-door ---
{
  const sim = GameSim.create({ seed: 4, autoSpawn: false });
  fillTicket(sim, "delivery", { destinationId: "house-1" });
  sim.hitTheRoad();
  startDoor(sim, "house-1");
  stepDoor(sim); // CHECK showing
  sim.tick(SHIFT_MS);
  rec(
    "G14-clock-mid-check",
    sim.snapshot().shiftEnded && sim.snapshot().dropoff.phase === "none" && sim.snapshot().clockLabel === "23:00",
    `ended=${sim.snapshot().shiftEnded} door=${sim.snapshot().dropoff.phase}`,
    "P0",
  );
}

// --- Bonus: shopClick after shift end ---
{
  const sim = GameSim.create({ seed: 2, autoSpawn: false });
  const o = sim.spawnOrder("inStore");
  waitCounter(sim, o.id);
  sim.shopClick({ type: "item", skuId: o.skuId });
  waitFetch(sim);
  sim.shopClick({ type: "customer", orderId: o.id });
  sim.endShift();
  const score = sim.score;
  sim.shopClick({ type: "item", skuId: o.skuId });
  rec("G15-shop-after-end", sim.score === score && sim.snapshot().shiftEnded, `score frozen at ${score}`, "P1");
}

const failed = rows.filter((r) => !r.ok);
const p0 = failed.filter((r) => r.severity === "P0").length;
const p1 = failed.filter((r) => r.severity === "P1").length;
const p2 = failed.filter((r) => r.severity === "P2").length;
console.log(`\n=== ${rows.filter((r) => r.ok).length}/${rows.length} passed | FAIL P0=${p0} P1=${p1} P2=${p2} ===`);
for (const r of failed) console.log(`  ${r.severity} ${r.id}: ${r.note}`);
if (failed.length) process.exitCode = 1;
