import { GAME_HEIGHT, GAME_WIDTH } from "../../sim/constants";
import type { SafeInset } from "../viewFit";

/** Minimum gap between any two plaque AABBs in design space. */
export const CHIP_GAP = 10;

/** Gutter inside the crop-aware safe inset for HUD slot anchors. */
export const SLOT_GUTTER = 12;

/**
 * Named HUD / shop / door / title slots (design 1920×1080, then {@link designHudInset} +
 * {@link SLOT_GUTTER}).
 *
 * | id            | Anchor                         | Who |
 * |---------------|--------------------------------|-----|
 * | scoreClock    | COUNTER_SIGN in shop; corner pockets on drive and door | SCORE caption + value + clock |
 * | cover         | Under scoreClock, maxWidth capped from shop mark | shopCover while keyLead in shop |
 * | doorTitle     | Top-center safe inset for whole door visit | Orange stop line on HUD |
 * | toast         | Top-center safe inset | Instruction / status line |
 * | settings      | Bottom-right cog AABB | Settings chrome |
 * | phone         | Above settings or left of it | Drive call UI |
 * | pad           | (removed) | Auto-drive nudge pad + label removed from drive map |
 * | titleCards    | Top 55% | How-to 1–3; Title owns; HUD hidden |
 * | titleCta      | Below cards, center | OPEN THE SHOP |
 * | speech-*      | Above settled customer head | Counter order announce |
 * | leadBubble    | Between key-lead head and TVs | Shop fetch/hold callout |
 * | driverBubble  | Above driver head | Shop ready line |
 * | tvCallout     | Above targeted TV anchor | Shop item hint |
 * | drivePin      | Top-center safe inset | Active delivery house + customer + SLA |
 * | driveVan      | (hidden) | Removed — van toast banner off map |
 * | driveShop     | (hidden) | Removed — shop-lot caption off map |
 * | doorPrompt    | Above customer head (headHang) | Door action instructions |
 * | scorePop      | Beside scoring actor slot | Hud flash |
 */
export type ChipSlotId =
  | "scoreClock"
  | "cover"
  | "doorTitle"
  | "toast"
  | "settings"
  | "phone"
  | "pad"
  | "titleCards"
  | "titleCta"
  | "leadBubble"
  | "driverBubble"
  | "tvCallout"
  | "drivePin"
  | "driveVan"
  | "driveShop"
  | "doorPrompt"
  | "scorePop"
  | `speech-${string}`;

/** Higher number wins placement disputes (placed first, others dodge). */
export const CHIP_PRIORITY: Record<string, number> = {
  titleCta: 100,
  settings: 90,
  scoreClock: 80,
  doorPrompt: 75,
  cover: 70,
  doorTitle: 70,
  toast: 60,
  phone: 55,
  leadBubble: 45,
  driverBubble: 44,
  tvCallout: 43,
  drivePin: 35,
  driveVan: 34,
  driveShop: 33,
  scorePop: 20,
  pad: 15,
};

export function speechSlotId(orderId: string): `speech-${string}` {
  return `speech-${orderId}`;
}

export function chipPriority(id: ChipSlotId | string): number {
  if (id in CHIP_PRIORITY) return CHIP_PRIORITY[id]!;
  if (id.startsWith("speech-")) {
    const idx = Number.parseInt(id.slice("speech-".length), 10);
    return Number.isFinite(idx) ? 50 - idx : 40;
  }
  return 10;
}

export interface ChipSafeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Crop-aware playable rect with {@link SLOT_GUTTER} padding. */
export function chipSafeRect(inset: SafeInset, viewW = GAME_WIDTH, viewH = GAME_HEIGHT): ChipSafeRect {
  const g = SLOT_GUTTER;
  return {
    left: inset.left + g,
    top: inset.top + g,
    right: viewW - inset.right - g,
    bottom: viewH - inset.bottom - g,
  };
}
