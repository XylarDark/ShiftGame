import { customerSlotX } from "./maps/shopT0";
import { houseById, tileToWorld } from "./maps/cityT0";
import { CALL_CONNECT_MS, NPC_INTERACT_COOLDOWN_MS } from "./sim/constants";
import type { GameSim } from "./sim/gameSim";

export type PromoShot = "drive" | "door";

/** `?doorstep=ask|check|hand|photo` stops the porch seed at that dropoff step. */
export type DoorstepShot = "ask" | "check" | "hand" | "photo";

export function doorstepQuery(): DoorstepShot | null {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? "").get("doorstep");
    if (q === "ask" || q === "check" || q === "hand" || q === "photo") return q;
  } catch {
    /* ignore */
  }
  return null;
}

/** `?capture=shop-*` seeds a lane still without promo drive/door setup. */
export type CaptureSeed = "shop-counter" | "shop-lead" | "shop-holding" | "shop-orders-badge";

export function captureQuery(): CaptureSeed | null {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? "").get("capture");
    if (
      q === "shop-counter" ||
      q === "shop-lead" ||
      q === "shop-holding" ||
      q === "shop-orders-badge"
    )
      return q;
  } catch {
    /* ignore */
  }
  return null;
}

/** `?shot=drive` (or map) / `?shot=door` (or id) for promo stills. */
export function shotQuery(): PromoShot | null {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? "").get("shot");
    if (q === "drive" || q === "map") return "drive";
    if (q === "door" || q === "id") return "door";
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * `?house=5` or `?house=house-5` aims the seeded delivery at one lot, so a capture can
 * reach a named stop instead of only the default one. Lots front streets of both
 * orientations, and a still of the van at a stop is only worth anything if you can choose
 * which stop. An unknown or malformed id falls back to the default rather than throwing.
 */
export function houseQuery(): string {
  try {
    const raw = new URLSearchParams(globalThis.location?.search ?? "").get("house");
    if (!raw) return DEFAULT_SHOT_HOUSE;
    const id = /^\d+$/.test(raw) ? `house-${raw}` : raw;
    return houseById(id) ? id : DEFAULT_SHOT_HOUSE;
  } catch {
    return DEFAULT_SHOT_HOUSE;
  }
}

const DEFAULT_SHOT_HOUSE = "house-1";

/**
 * `?drivems=6900` seeds the mid-run still that far into the drive instead of the default.
 *
 * How a van *approaches* a stall is only photographable if you can stop the clock while it
 * is still approaching, and that window is a second or so at the end of a run that varies
 * per lot. Out-of-range or malformed values fall back to the default, so a typo produces
 * the ordinary promo still rather than a blank road.
 */
export function driveMsQuery(): number {
  try {
    const raw = new URLSearchParams(globalThis.location?.search ?? "").get("drivems");
    if (!raw || !/^\d+$/.test(raw)) return DEFAULT_DRIVE_MS;
    const ms = Number(raw);
    return ms > 0 && ms <= MAX_DRIVE_MS ? ms : DEFAULT_DRIVE_MS;
  } catch {
    return DEFAULT_DRIVE_MS;
  }
}

const DEFAULT_DRIVE_MS = 7_000;
/** Longer than the slowest lot's drive; past this the van is parked and the value is a typo. */
const MAX_DRIVE_MS = 120_000;

function waitFetch(sim: GameSim): void {
  for (let i = 0; i < 300; i++) {
    if (sim.snapshot().keyLead.phase === "idle" && sim.snapshot().handSkuId) return;
    sim.tick(50);
  }
}

function waitCustomerSettled(sim: GameSim, orderId: string): void {
  for (let i = 0; i < 400; i++) {
    const snap = sim.snapshot();
    const c = snap.customers.find((v) => v.orderId === orderId);
    if (c && Math.abs(c.x - customerSlotX(0)) < 2 && c.bubble) return;
    sim.tick(50);
  }
}

/** Agent-capture seeds — shop counter speech and key-lead fetch band. */
export function applyCaptureSeed(sim: GameSim): void {
  const seed = captureQuery();
  if (!seed) return;

  if (seed === "shop-counter") {
    const order = sim.spawnOrder("inStore");
    waitCustomerSettled(sim, order.id);
    for (let i = 0; i < 40; i++) sim.tick(50);
    return;
  }

  if (seed === "shop-holding") {
    const order = sim.spawnOrder("inStore");
    waitCustomerSettled(sim, order.id);
    sim.shopClick({ type: "item", skuId: order.skuId });
    waitFetch(sim);
    return;
  }

  if (seed === "shop-orders-badge") {
    sim.spawnOrder("pickup");
    sim.spawnOrder("delivery", { destinationId: "house-1" });
    for (let i = 0; i < 16; i++) sim.tick(50);
    return;
  }

  const order = sim.spawnOrder("inStore");
  waitCustomerSettled(sim, order.id);
  sim.shopClick({ type: "item", skuId: order.skuId });
  for (let i = 0; i < 24; i++) sim.tick(50);
}

/** `?idmatch=0` seeds the promo delivery with an ID that doesn't match the order. */
export function idMatchQuery(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? "").get("idmatch") !== "0";
  } catch {
    return true;
  }
}

/** Seed a delivery mid-run (map) or at the ID-check porch (door). */
export function applyPromoShot(sim: GameSim): void {
  const shot = shotQuery();
  if (!shot) return;

  const houseId = houseQuery();
  const order = sim.spawnOrder("delivery", { destinationId: houseId, idMatches: idMatchQuery() });
  sim.shopClick({ type: "tablet", orderId: order.id });
  sim.shopClick({ type: "item", skuId: order.skuId });
  waitFetch(sim);
  sim.shopClick({ type: "bagRack" });
  sim.hitTheRoad();

  if (shot === "drive") {
    for (let i = Math.round(driveMsQuery() / 50); i > 0; i--) sim.tick(50);
    return;
  }

  const stop = houseById(houseId);
  if (!stop) return;
  const pos = tileToWorld(stop.stop);
  sim.setVehiclePosition(pos.x, pos.y);
  sim.tick(32);
  sim.interact();
  sim.tick(CALL_CONNECT_MS + 32);
  const step = doorstepQuery();
  if (step === "ask") return;
  sim.interact();
  sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
  if (step === "check" || step === null) return;
  sim.interact();
  sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
  if (step === "hand") return;
  sim.interact();
  sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
}
