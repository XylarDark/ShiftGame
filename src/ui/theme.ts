/** Shift visual tokens — dusk corner shop, chunky wood, muted leaf green. */
import { GAME_WIDTH } from "../sim/constants";
import { getStageContainScale } from "./viewFit";

export const Color = {
  ink: 0x140e0a,
  inkHex: "#140e0a",
  cream: 0xf4e8c1,
  creamHex: "#f4e8c1",
  creamSoftHex: "#e8d8b0",
  leaf: 0x3d6a44,
  /** Kindling sign leaf — shell / side-rail chrome. */
  leafHex: "#3d6a44",
  leafBright: 0x5a9a62,
  lime: 0xc8c070,
  limeHex: "#c8c070",
  neon: 0x8fce9a,
  neonHex: "#8fce9a",
  amber: 0xc86a38,
  amberHex: "#c86a38",
  gold: 0xc4a060,
  panel: 0x221c16,
  panelHex: "#221c16",
  panelStroke: 0x6a5640,
  skyTop: 0x1b2238,
  /** Shop/drive zenith — OS chrome / shell fill, not the leaf rails. */
  skyTopHex: "#1b2238",
  skyMid: 0x3d3a5c,
  skyLow: 0x8a5a62,
  brick: 0x4a3028,
  brickDeep: 0x2e1c16,
  wood: 0x7a4a2c,
  woodDark: 0x5a341c,
  woodLight: 0xc4a070,
  wall: 0xf7f1e8,
  wallHex: "#f7f1e8",
  wainscot: 0xe9dcc8,
  woodTrim: 0x8b5a32,
  woodTrimHex: "#8b5a32",
  counterTop: 0x6a4124,
  floor: 0x3a281c,
  floorLine: 0x4a3424,
  screen: 0x0c1612,
  screenHex: "#0c1612",
  danger: 0xff8a6a,
  dangerHex: "#ff8a6a",
  muteHex: "#a89880",
  /** Soft lime tint on the next tap target. */
  flash: 0xb8ffb0,
  /**
   * No banner-chip tokens live here any more. Text boxes are the counter plaque —
   * ink on a white field in a leaf frame — built with `addSignText`, so a chip colour
   * is not a decision a call site gets to make. See `ui/signPlaque.ts`.
   */
  /** Title / settings / results cream cards. */
  card: 0xfffaf3,
  cardHex: "#fffaf3",
} as const;

/**
 * Design-space type ramp for the 1920×1080 layout.
 * Sized to fit chrome; `fitTypeToBox` clamp-fits further inside [floor, ceiling].
 * On-screen CSS floors/ceilings after 16:9 contain live in {@link MSG_MIN_CSS_PX} /
 * {@link HUD_CHROME_MIN_CSS_PX} and are enforced via {@link scaleMsgPx} /
 * {@link scaleChromePx} + `fitTypeToBox` `minCssFloor` / `maxCssCeiling`.
 */
/** SCORE digits and caption — exported for tablet ORDERS parity. */
export const HUD_SCORE_PX = 26.4;
export const HUD_READOUT_PX = 32;
export const HUD_COG_CAPTION_PX = 18 * 1.25;

export const Type = {
  display: "36px",
  title: "27px",
  heading: "20px",
  body: "16px",
  caption: "13px",
  micro: "11px",
} as const;

/** Absolute shrink floor — below this, prefer wrapping/ellipsis over unreadable glyphs. */
export const TYPE_MIN_FIT_PX = 10;

/**
 * Shared bump for chip / speech / toast message UI (~+25% type, padding, and box).
 * Applied on top of each scene's authored message sizes rather than raising the Type
 * ramp, so chrome readouts (SCORE, clock, ORDERS label, settings) stay put on desktop.
 */
export const MSG_SCALE = 1.25;

/**
 * Extra multiplier for message chips + HUD chrome when the contained stage is small
 * (phone landscape side rails / height-fill crop). Stacks on {@link MSG_SCALE} for messages;
 * chrome uses this alone (chrome does not take MSG_SCALE).
 */
export const MOBILE_TEXT_SCALE = 1.2;

/** Apply mobile text ramp when stageCssWidth/1920 is strictly below this. */
export const MOBILE_STAGE_SCALE_MAX = 0.6;

/** Coarse-pointer + viewport width under this also gates the mobile ramp. */
export const MOBILE_TEXT_VIEWPORT_MAX_CSS = 900;

/** Message-chip body type: minimum on-screen CSS px after contain. */
export const MSG_MIN_CSS_PX = 14;

/** Message-chip grow cap in on-screen CSS px. */
export const MSG_MAX_CSS_PX = 20;

/** Primary HUD chrome labels: minimum on-screen CSS px after contain. */
export const HUD_CHROME_MIN_CSS_PX = 12;

/** HUD chrome grow cap in on-screen CSS px. */
export const HUD_CHROME_MAX_CSS_PX = 16;

/** TV boards, settings rows, results, title chrome. */
export const TV_MENU_MIN_CSS_PX = 13;

export const TV_MENU_MAX_CSS_PX = 18;

/** Spread onto message chips / speech / door prompts. */
export const MSG_TYPE_FIT = { minCssFloor: MSG_MIN_CSS_PX, maxCssCeiling: MSG_MAX_CSS_PX } as const;

/** Spread onto SCORE / clock / cog / phone chrome. */
export const HUD_TYPE_FIT = { minCssFloor: HUD_CHROME_MIN_CSS_PX, maxCssCeiling: HUD_CHROME_MAX_CSS_PX } as const;

/** Spread onto TV item names, settings, results, title cards. */
export const MENU_TYPE_FIT = { minCssFloor: TV_MENU_MIN_CSS_PX, maxCssCeiling: TV_MENU_MAX_CSS_PX } as const;

/** Extra padding scale on message chips while the mobile ramp is active. */
export const MOBILE_MSG_PAD_EXTRA = 1.15;

/** Design-space px needed so `minCssPx` survives the current contain scale. */
export function designPxForMinCss(minCssPx: number, stageScale: number): number {
  if (!(stageScale > 0) || !(minCssPx > 0)) return Math.ceil(Math.max(0, minCssPx));
  return Math.ceil(minCssPx / stageScale);
}

export interface MobileTextHints {
  coarsePointer?: boolean;
  viewportCssWidth?: number;
}

/**
 * Gate for {@link MOBILE_TEXT_SCALE}: small contain scale, or coarse pointer on a
 * narrow viewport (phone landscape even when scale sits near the threshold).
 */
export function shouldApplyMobileTextRamp(
  stageScale: number,
  hints: MobileTextHints = {},
): boolean {
  if (stageScale > 0 && stageScale < MOBILE_STAGE_SCALE_MAX) return true;
  if (
    hints.coarsePointer === true &&
    hints.viewportCssWidth !== undefined &&
    hints.viewportCssWidth < MOBILE_TEXT_VIEWPORT_MAX_CSS
  ) {
    return true;
  }
  return false;
}

function readMobileHints(): MobileTextHints {
  const coarse =
    typeof globalThis.matchMedia === "function"
      ? (globalThis.matchMedia("(pointer: coarse)").matches ?? false)
      : false;
  const view = globalThis.visualViewport;
  const width = Math.round(view?.width ?? globalThis.innerWidth ?? GAME_WIDTH);
  return { coarsePointer: coarse, viewportCssWidth: width };
}

export function effectiveMsgScale(mobile: boolean): number {
  return MSG_SCALE * (mobile ? MOBILE_TEXT_SCALE : 1);
}

export function effectiveChromeScale(mobile: boolean): number {
  return mobile ? MOBILE_TEXT_SCALE : 1;
}

function roundPx(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function resolveMobile(stageScale: number, hints?: MobileTextHints): boolean {
  return shouldApplyMobileTextRamp(stageScale, hints ?? readMobileHints());
}

/** Scale a design-space px size and return a CSS fontSize string (message tier). */
export function scaleMsgPx(
  px: number,
  stageScale = getStageContainScale(),
  hints?: MobileTextHints,
): string {
  const mobile = resolveMobile(stageScale, hints);
  const scaled = px * effectiveMsgScale(mobile);
  const floored = Math.max(scaled, designPxForMinCss(MSG_MIN_CSS_PX, stageScale));
  return `${roundPx(floored)}px`;
}

/** Scale chip padding (slightly more under the mobile ramp). */
export function scaleMsgPad(
  pad: { x: number; y: number },
  stageScale = getStageContainScale(),
  hints?: MobileTextHints,
): { x: number; y: number } {
  const mobile = resolveMobile(stageScale, hints);
  const factor = effectiveMsgScale(mobile) * (mobile ? MOBILE_MSG_PAD_EXTRA : 1);
  return { x: Math.round(pad.x * factor), y: Math.round(pad.y * factor) };
}

/** Scale a maxWidth / maxHeight box edge (message tier). */
export function scaleMsgBox(
  n: number,
  stageScale = getStageContainScale(),
  hints?: MobileTextHints,
): number {
  const mobile = resolveMobile(stageScale, hints);
  return Math.round(n * effectiveMsgScale(mobile));
}

/** `fitTypeToBox` floor so message chips stay ≥ {@link MSG_MIN_CSS_PX} on screen. */
export function msgMinFitPx(stageScale = getStageContainScale()): number {
  return Math.max(TYPE_MIN_FIT_PX, designPxForMinCss(MSG_MIN_CSS_PX, stageScale));
}

/**
 * HUD chrome: apply {@link MOBILE_TEXT_SCALE} (not MSG_SCALE) + CSS floor.
 * Use for SCORE / clock / ORDERS-adjacent labels — not TV board item names.
 */
export function scaleChromePx(
  px: number,
  stageScale = getStageContainScale(),
  hints?: MobileTextHints,
): string {
  const mobile = resolveMobile(stageScale, hints);
  const scaled = px * effectiveChromeScale(mobile);
  const floored = Math.max(scaled, designPxForMinCss(HUD_CHROME_MIN_CSS_PX, stageScale));
  return `${roundPx(floored)}px`;
}

/** `fitTypeToBox` floor so HUD chrome stays ≥ {@link HUD_CHROME_MIN_CSS_PX} on screen. */
export function chromeMinFitPx(stageScale = getStageContainScale()): number {
  return Math.max(TYPE_MIN_FIT_PX, designPxForMinCss(HUD_CHROME_MIN_CSS_PX, stageScale));
}
