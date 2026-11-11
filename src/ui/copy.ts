import { MS_PER_GAME_MINUTE } from "../sim/constants";
import { brand } from "./brand";

/** Shared shop copy — title case, en dashes, no slang hours. */
export const MARK = brand.mark;
export const HOURS = "Open\n9 AM – 11 PM";
export const WELCOME_TITLE = brand.welcomeTitle;
export const WELCOME_HINT = "One shift as key-lead, then out on deliveries — tap to begin";
export const PAUSE_HINT = "Paused — tap to start";
export const HOWTO_HINT = "Tap, click, or press any key";

/** Opening how-to cards — short, scannable, one job each. */
export const HOWTO_STEPS = [
  {
    title: "Counter sale",
    body: "Walk-in names an item. Tap that TV, wait for the fetch, then tap the customer. No bag.",
  },
  {
    title: "Pickup ticket",
    body: "Tap the flashing tablet, that item, then a bag. When they arrive, tap them at the counter.",
  },
  {
    title: "Delivery run",
    body: `Pack the same way, then tap the flashing driver. Stops: call → ASK ID → bag → photo. Empty van returns to ${brand.howtoDeliveryReturn}. Ends 11 PM.`,
  },
] as const;

/** Under this remaining SLA, bag labels go urgent (danger color). */
export const SLA_URGENT_MS = 10 * MS_PER_GAME_MINUTE;

/** Game-minute countdown. 1 real second = 1 game minute; expired stays LATE. */
export function formatSlaClock(remainingMs: number | null): string {
  if (remainingMs === null) return "";
  if (remainingMs <= 0) return "LATE";
  return `${Math.max(1, Math.ceil(remainingMs / MS_PER_GAME_MINUTE))}m`;
}

export function isSlaUrgent(remainingMs: number | null): boolean {
  return remainingMs !== null && remainingMs <= SLA_URGENT_MS;
}

/** One printed slip on the counter rail: where it goes, who it is for, time left. */
export function receiptSlipLine(destLabel: string, customerName: string, slaRemainingMs: number | null): string {
  const clock = formatSlaClock(slaRemainingMs);
  if (!clock) return `${destLabel}  ·  ${customerName}`;
  return `${destLabel}  ·  ${customerName}  ·  ${clock}`;
}

/** Slips past the end of the rail collapse into one row. */
export function receiptOverflowLine(hidden: number): string {
  return `+${hidden} more`;
}

export function driverReadyCopy(bagCount: number): string {
  if (bagCount > 1) {
    return `Tap me to take ${bagCount} packed bags\n— or wait for another delivery.`;
  }
  return "Tap me when you're ready to leave\n— or wait for another delivery.";
}

export const BACK_TO_SHOP_COPY = { label: "BACK TO SHOP", caption: brand.backToShopCaption };

export const RESULTS_NEW_DAY = { label: "NEW DAY", caption: "09:00 · score resets" };
export const RESULTS_TITLE = { label: "TITLE", caption: "Back to welcome" };
export const END_SHIFT_LABEL = "END SHIFT";
export const END_SHIFT_CAPTION = "Close early · see results";

export function interactButtonCopy(
  action: string,
): { label: string; caption: string } | null {
  switch (action) {
    case "HANDOFF":
      return { label: "HANDOFF", caption: "Give them the bag" };
    case "ASK ID":
      return { label: "ASK FOR ID", caption: "Tap the customer" };
    case "CHECK ID":
      return { label: "CHECK ID", caption: "Tap the ID card" };
    case "HAND BAG":
      return { label: "HAND BAG", caption: "Tap the bag to hand over" };
    case "PHOTO":
      return { label: "PHOTO", caption: "Tap the bag for a photo" };
    case "PARK":
      return { label: "PARK", caption: "Park in the driveway" };
    default:
      return null;
  }
}
