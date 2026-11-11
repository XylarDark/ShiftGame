import { brand } from "../ui/brand";
import { formatGameClock } from "./clock";
import {
  SCORE_DELIVERY_LATE,
  SCORE_DELIVERY_ON_TIME,
  SCORE_FAIL,
  SCORE_INSTORE,
  SCORE_PICKUP,
} from "./constants";
import type { Order } from "./orders";

export interface ShiftBreakdown {
  inStore: number;
  pickups: number;
  deliveriesOnTime: number;
  deliveriesLate: number;
  fails: number;
}

export interface ShiftResults {
  score: number;
  clockLabel: string;
  gameMs: number;
  breakdown: ShiftBreakdown;
  idMismatchFails: number;
  title: string;
  verdict: string;
}

export function countShiftBreakdown(orders: readonly Order[]): ShiftBreakdown {
  let inStore = 0;
  let pickups = 0;
  let deliveriesOnTime = 0;
  let deliveriesLate = 0;
  let fails = 0;
  for (const order of orders) {
    if (order.status === "failed") {
      fails += 1;
      continue;
    }
    if (order.status !== "completed") continue;
    if (order.type === "inStore") inStore += 1;
    else if (order.type === "pickup") pickups += 1;
    else if (order.type === "delivery") {
      if (order.late) deliveriesLate += 1;
      else deliveriesOnTime += 1;
    }
  }
  return { inStore, pickups, deliveriesOnTime, deliveriesLate, fails };
}

export function shiftVerdict(breakdown: ShiftBreakdown, idMismatchFails: number): string {
  if (idMismatchFails > 0) {
    return idMismatchFails === 1
      ? "ID review — one handoff was refused because the name didn't match."
      : `ID review — ${idMismatchFails} handoffs were refused because the names didn't match.`;
  }
  if (breakdown.fails >= 3 || breakdown.deliveriesLate >= 3) {
    return "Sloppy shift — too many fails or late drops.";
  }
  if (breakdown.fails > 0 || breakdown.deliveriesLate > 0) {
    return "Messy but open — tighten SLAs and handoffs next time.";
  }
  const sold =
    breakdown.inStore + breakdown.pickups + breakdown.deliveriesOnTime + breakdown.deliveriesLate;
  if (sold === 0) return "Quiet shift — the floor barely moved.";
  return brand.shiftVerdictClean;
}

export function shiftResultsTitle(breakdown: ShiftBreakdown, idMismatchFails: number): string {
  if (idMismatchFails > 0) return "Shift closed — ID review";
  if (breakdown.fails >= 3) return "Shift closed — rough night";
  return brand.shiftTitleEnd;
}

export function buildShiftResults(
  orders: readonly Order[],
  score: number,
  gameMs: number,
  idMismatchFails: number,
): ShiftResults {
  const breakdown = countShiftBreakdown(orders);
  return {
    score,
    clockLabel: formatGameClock(gameMs),
    gameMs,
    breakdown,
    idMismatchFails,
    title: shiftResultsTitle(breakdown, idMismatchFails),
    verdict: shiftVerdict(breakdown, idMismatchFails),
  };
}

export function expectedScoreFromBreakdown(b: ShiftBreakdown): number {
  return (
    b.inStore * SCORE_INSTORE +
    b.pickups * SCORE_PICKUP +
    b.deliveriesOnTime * SCORE_DELIVERY_ON_TIME +
    b.deliveriesLate * SCORE_DELIVERY_LATE +
    b.fails * SCORE_FAIL
  );
}
