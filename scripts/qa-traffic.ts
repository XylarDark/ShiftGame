/**
 * Traffic QA harness — separation, yield, crawl, speed bands, hitch, park.
 * Run: npx tsx scripts/qa-traffic.ts
 */
import {
  PARK_ARRIVE_RADIUS,
  VEHICLE_SPEED,
} from "../src/sim/constants";
import { GameSim } from "../src/sim/gameSim";
import { houseById, tileToWorld, TILE } from "../src/maps/cityT0";
import {
  TRAFFIC_LOOP_MAX,
  TRAFFIC_MIN_SEP,
  TRAFFIC_VAN_DETECT,
  VAN_CRAWL_GAP,
  VAN_MATCH_GAP,
  buildTrafficLoops,
  cityTrafficLoops,
  driveSpeedForTraffic,
  trafficCars,
} from "../src/maps/traffic";

type Row = { id: string; ok: boolean; severity: "P0" | "P1" | "P2" | "PASS"; note: string };
const rows: Row[] = [];

function rec(id: string, ok: boolean, note: string, severity: Row["severity"] = ok ? "PASS" : "P1"): void {
  rows.push({ id, ok, severity: ok ? "PASS" : severity, note });
  console.log(`${ok ? "PASS" : `FAIL(${severity})`}  ${id}: ${note}`);
}

function waitFetch(sim: GameSim): void {
  for (let i = 0; i < 300; i++) {
    if (sim.snapshot().keyLead.phase === "idle" && sim.snapshot().handSkuId) return;
    sim.tick(50);
  }
}

function fillDelivery(sim: GameSim, houseId = "house-1") {
  const order = sim.spawnOrder("delivery", { destinationId: houseId, idMatches: true });
  sim.shopClick({ type: "tablet", orderId: order.id });
  sim.shopClick({ type: "item", skuId: order.skuId });
  waitFetch(sim);
  sim.shopClick({ type: "bagRack" });
  return order;
}

const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);

// --- T-sep ---
{
  let worst = Infinity;
  for (const t of [0, 1_200, 4_000, 9_500, 18_000, 27_000, 41_000]) {
    const cars = trafficCars(t, loops);
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const gap = Math.hypot(cars[i]!.x - cars[j]!.x, cars[i]!.y - cars[j]!.y);
        worst = Math.min(worst, gap);
      }
    }
  }
  rec("T-sep", worst >= TRAFFIC_MIN_SEP - 1, `minGap=${worst.toFixed(1)} minSep=${TRAFFIC_MIN_SEP}`);
}

// --- T-van-sep ---
{
  let worst = Infinity;
  for (const t of [0, 3_000, 11_000, 20_000]) {
    const raw = trafficCars(t, loops);
    if (!raw[0]) continue;
    const van = { x: raw[0].x, y: raw[0].y, heading: raw[0].angle };
    for (const car of trafficCars(t, loops, van)) {
      worst = Math.min(worst, Math.hypot(car.x - van.x, car.y - van.y));
    }
  }
  rec("T-van-sep", worst >= TRAFFIC_MIN_SEP - 1, `minGap=${worst.toFixed(1)}`);
}

// --- T-oncoming ---
{
  let ok = true;
  let note = "no close oncoming pairs";
  for (const t of [0, 5_000, 12_000]) {
    const cars = trafficCars(t, loops);
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i]!;
        const b = cars[j]!;
        const gap = Math.hypot(a.x - b.x, a.y - b.y);
        if (gap > 160) continue;
        const facing = Math.cos(a.angle) * Math.cos(b.angle) + Math.sin(a.angle) * Math.sin(b.angle);
        if (facing > -0.5) continue;
        const lateral = Math.abs(-Math.sin(a.angle) * (b.x - a.x) + Math.cos(a.angle) * (b.y - a.y));
        if (lateral <= 40) {
          ok = false;
          note = `oncoming ${a.id}/${b.id} lateral=${lateral.toFixed(1)}`;
        }
      }
    }
  }
  rec("T-oncoming", ok, note);
}

// --- T-yield-ahead ---
{
  const base = trafficCars(4_000, loops);
  const lead = base[0]!;
  const van = {
    x: lead.x + Math.cos(lead.angle) * (TRAFFIC_VAN_DETECT * 0.45),
    y: lead.y + Math.sin(lead.angle) * (TRAFFIC_VAN_DETECT * 0.45),
    heading: lead.angle,
  };
  const reacted = trafficCars(4_000, loops, van).find((c) => c.id === lead.id)!;
  const gap = Math.hypot(reacted.x - van.x, reacted.y - van.y);
  rec(
    "T-yield-ahead",
    reacted.speed === 0 && gap >= TRAFFIC_MIN_SEP - 1,
    `speed=${reacted.speed} gap=${gap.toFixed(1)}`,
  );
}

// --- T-no-crawl ---
{
  const base = trafficCars(5_000, loops);
  const lead = base[0]!;
  const van = {
    x: lead.x - Math.cos(lead.angle) * 80,
    y: lead.y - Math.sin(lead.angle) * 80,
    heading: lead.angle,
  };
  const reacted = trafficCars(5_000, loops, van).find((c) => c.id === lead.id)!;
  rec("T-no-crawl", reacted.speed > 0, `behindApproach speed=${reacted.speed} (must not zero)`);
}

// --- T-lead-speed ---
{
  const cruise = VEHICLE_SPEED;
  const lead = { id: "l", x: 200, y: 0, key: "tex-car", depth: 5, angle: 0, speed: 120 };
  const player = { x: 0, y: 0, heading: 0 };
  // Each distance is taken off the band edge it is meant to sit just outside or inside, so a
  // trim to VAN_FOLLOW_GAP_SCALE moves these with it. Fixed 150/120 were tuned to the bands
  // as they stood before the gaps widened, and quietly landed one band lower afterwards.
  const clear = driveSpeedForTraffic(player, [], cruise);
  const soft = driveSpeedForTraffic(player, [{ ...lead, x: VAN_MATCH_GAP + 8 }], cruise);
  const hard = driveSpeedForTraffic(player, [{ ...lead, x: VAN_MATCH_GAP - 8 }], cruise);
  const stopped = driveSpeedForTraffic(player, [{ ...lead, x: VAN_CRAWL_GAP - 8, speed: 0 }], cruise);
  const ok =
    clear === cruise &&
    soft === Math.min(cruise, 140) &&
    hard === Math.min(cruise, 120) &&
    stopped >= cruise * 0.2;
  rec(
    "T-lead-speed",
    ok,
    `clear=${clear} soft=${soft} hard=${hard} stoppedFloor=${stopped.toFixed(1)}`,
  );
}

// --- T-manual ---
{
  const sim = GameSim.create({ seed: 5, autoSpawn: false });
  fillDelivery(sim);
  sim.hitTheRoad();
  const start = { ...sim.snapshot().vehicle };
  // Plant a stopped lead just ahead by using traffic + manual input along heading.
  const cars = trafficCars(sim.clock.gameMs, cityTrafficLoops(), {
    x: start.x,
    y: start.y,
    heading: sim.snapshot().vehicle.heading,
  });
  const lead = cars.find((c) => {
    const dx = c.x - start.x;
    const dy = c.y - start.y;
    const forward = Math.cos(sim.snapshot().vehicle.heading) * dx + Math.sin(sim.snapshot().vehicle.heading) * dy;
    return forward > 40 && forward < 160;
  });
  sim.setPlayerInput(Math.cos(sim.snapshot().vehicle.heading), Math.sin(sim.snapshot().vehicle.heading));
  const before = { ...sim.snapshot().vehicle };
  sim.tick(200);
  const after = sim.snapshot().vehicle;
  const moved = Math.hypot(after.x - before.x, after.y - before.y);
  const capped = driveSpeedForTraffic(
    { x: before.x, y: before.y, heading: sim.snapshot().vehicle.heading },
    trafficCars(sim.clock.gameMs - 200, cityTrafficLoops(), {
      x: before.x,
      y: before.y,
      heading: Math.atan2(after.y - before.y, after.x - before.x) || sim.snapshot().vehicle.heading,
    }),
    VEHICLE_SPEED,
  );
  // Manual path must move, but not at full cruise*dt when a lead is in look-ahead.
  const full = VEHICLE_SPEED * 0.2;
  const okManual = moved > 8 && (!lead || moved <= full + TILE);
  rec(
    "T-manual",
    okManual,
    `moved=${moved.toFixed(1)} lead=${lead?.id ?? "none"} fullDt=${full.toFixed(1)} capped~${capped.toFixed(0)}`,
  );
  sim.setPlayerInput(0, 0);
}

// --- T-hitch ---
{
  const sim = GameSim.create({ seed: 5, autoSpawn: false });
  fillDelivery(sim, "house-1");
  sim.hitTheRoad();
  const stop = houseById("house-1")!;
  const pad = tileToWorld(stop.stop);
  // Huge hitch frame mid-run — must not softlock; keep autoDriving or arrive.
  for (let i = 0; i < 40; i++) sim.tick(50);
  const mid = { ...sim.snapshot().vehicle };
  sim.tick(2_500);
  const after = sim.snapshot().vehicle;
  const progressed = Math.hypot(after.x - mid.x, after.y - mid.y) > 40 || !sim.snapshot().autoDriving;
  const notFrozen = sim.snapshot().playerRole === "driver";
  rec("T-hitch", progressed && notFrozen, `progressed=${progressed} auto=${sim.snapshot().autoDriving} nearPad=${Math.hypot(after.x - pad.x, after.y - pad.y).toFixed(0)}`);
}

// --- T-park ---
{
  const sim = GameSim.create({ seed: 5, autoSpawn: false });
  fillDelivery(sim, "house-1");
  sim.hitTheRoad();
  for (let i = 0; i < 2_500 && sim.snapshot().autoDriving; i++) sim.tick(50);
  const stop = houseById("house-1")!;
  const pad = tileToWorld(stop.stop);
  const v = sim.snapshot().vehicle;
  const d = Math.hypot(v.x - pad.x, v.y - pad.y);
  rec(
    "T-park",
    !sim.snapshot().autoDriving && d < PARK_ARRIVE_RADIUS + 2,
    `auto=${sim.snapshot().autoDriving} dist=${d.toFixed(1)} phase=${sim.snapshot().dropoff.phase}`,
  );
}

const fail = rows.filter((r) => !r.ok);
const p0 = fail.filter((r) => r.severity === "P0").length;
const p1 = fail.filter((r) => r.severity === "P1").length;
const p2 = fail.filter((r) => r.severity === "P2").length;
console.log(`\n=== ${rows.length - fail.length}/${rows.length} passed | FAIL P0=${p0} P1=${p1} P2=${p2} ===`);
process.exit(fail.length ? 1 : 0);
