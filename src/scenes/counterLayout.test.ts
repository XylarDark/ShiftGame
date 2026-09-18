import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COUNTER_SIGN, TABLET, tabletLayout } from "../maps/shopT0";

/**
 * The shop tablet's ORDERS label against the HUD readouts that share the room with it.
 *
 * Phaser cannot be imported here — it touches `window` at module load — so the scenes
 * are read as source and the geometry is recomputed from the same constants they use.
 * Every extraction throws when its marker moves rather than falling back to a wider
 * scan: a fail-open source read in this repo once let a whole audit pass by matching
 * nothing at all.
 */
const here = dirname(fileURLToPath(import.meta.url));
/** core.autocrlf is true here, so a checkout delivers CRLF — normalise before matching. */
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

const readouts = read("../ui/hud/readouts.ts");
const constants = read("../ui/hud/constants.ts");
const shop = read("ShopScene.ts");

function between(text: string, start: string, end: string, what: string): string {
  const from = text.indexOf(start);
  if (from === -1) throw new Error(`${what}: start marker not found: ${JSON.stringify(start)}`);
  const to = text.indexOf(end, from + start.length);
  if (to === -1) throw new Error(`${what}: end marker not found: ${JSON.stringify(end)}`);
  return text.slice(from, to);
}

function number(text: string, pattern: RegExp, what: string): number {
  const found = pattern.exec(text);
  if (!found?.[1]) throw new Error(`${what}: no match for ${pattern}`);
  const value = Number(found[1]);
  if (!Number.isFinite(value)) throw new Error(`${what}: ${found[1]} is not a number`);
  return value;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const centred = (x: number, y: number, w: number, h: number): Rect => ({
  left: x - w / 2,
  top: y - h / 2,
  right: x + w / 2,
  bottom: y + h / 2,
});

const union = (rects: readonly Rect[]): Rect => ({
  left: Math.min(...rects.map((r) => r.left)),
  top: Math.min(...rects.map((r) => r.top)),
  right: Math.max(...rects.map((r) => r.right)),
  bottom: Math.max(...rects.map((r) => r.bottom)),
});

const SIGN_GAP = number(constants, /export const HUD_SIGN_GAP = (\d+);/, "HUD_SIGN_GAP");
const SCORE_GAP = number(constants, /export const HUD_SCORE_GAP = (\d+);/, "HUD_SCORE_GAP");

const scoreBlock = between(readouts, "this.scoreText = addUiText(this.scene, 0, 0, \"\", {", "})", "score value style");
const captionBlock = between(readouts, 'this.scoreCaption = addUiText(this.scene, 0, 0, "SCORE"', "})", "SCORE caption style");
const clockBlock = between(readouts, "this.clockText = addUiText(this.scene, 0, 0, \"\", {", "})", "clock style");
const popBlock = between(readouts, "warmScorePopPool(): void {", "\n  }", "warmScorePopPool");
const placeReadouts = between(readouts, "placeReadouts(): void {", "\n  }", "placeReadouts");
const ordersBlock = between(shop, "this.tabletLabel = addUiText(", ".setOrigin(0.5)", "ORDERS style");

const boxOf = (block: string, what: string): { w: number; h: number } => {
  const mw = /maxWidth: (\d+)/.exec(block);
  const mh = /maxHeight: (\d+)/.exec(block);
  if (mw?.[1] && mh?.[1]) {
    return { w: Number(mw[1]), h: Number(mh[1]) };
  }
  throw new Error(`${what}: no maxWidth/maxHeight`);
};

/** Fixed hudTitle / typeClock tokens — measured worst-case glyph bands at 1920×1080. */
const FIXED_SCORE_VALUE = { w: 360, h: 68 };
const FIXED_SCORE_CAPTION = { w: 220, h: 68 };
const FIXED_CLOCK = { w: 360, h: 62 };

const scoreBox = scoreBlock.includes("typeRole:") ? FIXED_SCORE_VALUE : boxOf(scoreBlock, "score value");
const captionBox = captionBlock.includes("typeRole:") ? FIXED_SCORE_CAPTION : boxOf(captionBlock, "SCORE caption");
const clockBox = clockBlock.includes("typeClockPx") ? FIXED_CLOCK : boxOf(clockBlock, "clock");
const popBox = popBlock.includes("typeRoleBox")
  ? { w: Math.round(160 * 1.25), h: Math.round(40 * 1.25) }
  : boxOf(popBlock, "score pop");
const POP_LIFT = number(placeReadouts, /scorePopPark = \{ x: signLeft, y: y - (\d+) \}/, "pop lift");
const popTween = between(readouts, "spawnScorePop(delta: number, screen?: { x: number; y: number }): void {", "\n  }", "spawnScorePop");
const POP_RISE = number(popTween, /origin\.y - (\d+)/, "pop rise");
const ORDERS_INSET = number(shop, /const TABLET_LABEL_INSET = (\d+);/, "TABLET_LABEL_INSET");

const tab = tabletLayout();
/**
 * Worst case, not the case on screen. `fitTypeToBox` shrinks type until it fits the box
 * it was given and never grows past it, so a readout's declared `maxWidth` is a hard cap
 * on its footprint however many digits the score reaches — which is what makes this
 * check independent of the score's value instead of true only at 0.
 */
const scoreValue: Rect = {
  right: COUNTER_SIGN.x - COUNTER_SIGN.w / 2 - SIGN_GAP,
  left: COUNTER_SIGN.x - COUNTER_SIGN.w / 2 - SIGN_GAP - scoreBox.w,
  top: COUNTER_SIGN.y - scoreBox.h / 2,
  bottom: COUNTER_SIGN.y + scoreBox.h / 2,
};
/** The caption tracks the measured value width, so it is pushed out by a widest-case value. */
const scoreCaption: Rect = {
  right: scoreValue.left - SCORE_GAP,
  left: scoreValue.left - SCORE_GAP - captionBox.w,
  top: COUNTER_SIGN.y - captionBox.h / 2,
  bottom: COUNTER_SIGN.y + captionBox.h / 2,
};
/** The pop rises out of the value, so its band reaches higher than the readout's. */
const scorePop: Rect = {
  right: scoreValue.right,
  left: scoreValue.right - popBox.w,
  top: COUNTER_SIGN.y - POP_LIFT - POP_RISE - popBox.h / 2,
  bottom: COUNTER_SIGN.y - POP_LIFT + popBox.h / 2,
};
const scoreGroup = union([scoreValue, scoreCaption, scorePop]);
const ordersLabel = centred(
  tab.screenLeft + tab.screenW / 2,
  tab.screenTop + (tab.screenH - tab.homeH) / 2,
  tab.screenW - ORDERS_INSET * 2,
  tab.screenH - ORDERS_INSET * 2,
);

describe("scoreClock inside COUNTER_SIGN", () => {
  it("keeps caption and value inside the sign band with shrinkable gap", () => {
    const place = between(readouts, "placeReadouts(): void {", "\n  }", "placeReadouts");
    expect(place).toContain("COUNTER_SIGN.w / 2");
    expect(place).toContain("while (gap > 4");
    expect(place).toContain("signLeft - valueW - gap");
  });
});

describe("ORDERS against the counter readouts", () => {
  it("measures two real boxes, so a pass cannot come from comparing nothing", () => {
    // Both of the audits this repo has been burned by reported clean while inspecting
    // zero items. Degenerate rects would make every overlap assertion below vacuous.
    for (const [what, rect] of [
      ["score group", scoreGroup],
      ["ORDERS label", ordersLabel],
    ] as const) {
      expect(rect.right - rect.left, `${what} width`).toBeGreaterThan(50);
      expect(rect.bottom - rect.top, `${what} height`).toBeGreaterThan(20);
    }
  });

  it("keeps the score group clear of the ORDERS label at any score", () => {
    expect(overlaps(scoreGroup, ordersLabel)).toBe(false);
    // Named separately from the boolean: an off-by-a-pixel pass is not the intent, and a
    // future layout change that eats the clearance should say by how much when it fails.
    // The tightest edge is the score pop, which rises 56px out of the value — box to box
    // that leaves 48px, and glyph to glyph 72px, since both boxes are taller than their
    // type. A floor rather than the exact figure, so the type ramp can move; anything
    // under it means the pop is climbing into the tablet and wants a shorter rise.
    expect(ordersLabel.bottom, "ORDERS sits above the readout band").toBeLessThan(scoreGroup.top);
    expect(scoreGroup.top - ordersLabel.bottom).toBeGreaterThanOrEqual(32);
    expect(scoreGroup.right, "the score group ends left of the tablet").toBeLessThan(ordersLabel.left);
    // 480px of it, so this is not a near miss that a wider readout box would erase.
    expect(ordersLabel.left - scoreGroup.right).toBeGreaterThan(400);
  });

  it("grows the score away from the tablet, which is why the clearance holds", () => {
    // Origin (1, 0.5) at the sign's left edge: every digit added extends the value
    // leftward into open counter, never rightward toward the tablet. Without this the
    // bounded-box argument above would still hold, but only by luck of the direction.
    expect(placeReadouts).toContain("counterSignReadoutAnchors()");
    expect(placeReadouts).toContain("this.scoreText.setOrigin(1, 0.5).setPosition(signLeft, y)");
    expect(placeReadouts).toMatch(/signLeft - valueW - (?:gap|HUD_SCORE_GAP)/);
    expect(placeReadouts).toContain("while (gap > 4");
    expect(scoreBox.w).toBeGreaterThan(0);
    expect(scoreBlock).toContain('typeRole: "hudTitle"');
    expect(scoreBlock).toContain('typeRolePx("hudTitle")');
  });

  it("keeps the clock clear of the tablet too, since that readout grows toward it", () => {
    // The clock flanks the sign on the other side and runs right, under the tablet. Its
    // width cannot save it, so the guarantee there is the vertical gap.
    const clock: Rect = {
      left: COUNTER_SIGN.x + COUNTER_SIGN.w / 2 + SIGN_GAP,
      right: COUNTER_SIGN.x + COUNTER_SIGN.w / 2 + SIGN_GAP + clockBox.w,
      top: COUNTER_SIGN.y - clockBox.h / 2,
      bottom: COUNTER_SIGN.y + clockBox.h / 2,
    };
    expect(clock.right, "the clock's widest box does reach under the tablet").toBeGreaterThan(ordersLabel.left);
    expect(overlaps(clock, ordersLabel)).toBe(false);
    expect(clock.top - ordersLabel.bottom).toBeGreaterThan(48);
  });
});

describe("SCORE caption type size", () => {
  it("is seeded at the value's step, not a caption step of its own", () => {
    expect(captionBlock).toContain('typeRolePx("hudTitle")');
    expect(captionBlock).toContain('typeRole: "hudTitle"');
    // Measured in-browser at 1920x1080: "SCORE" renders 164x59 at 44px with its
    // tracking. Fixed tokens skip clamp-fit so caption and value stay matched.
    expect(captionBox.w).toBeGreaterThanOrEqual(164);
    expect(captionBox.h).toBeGreaterThanOrEqual(59);
  });

  it("follows the value's rendered size rather than the seed they share", () => {
    // A score long enough to shrink inside its own box would leave a seed-sized caption
    // beside a smaller number. The match is made against what the value renders at, and
    // it has to happen before anything is measured off the caption's width.
    expect(readouts).toContain("matchCaptionToValue(): void");
    expect(placeReadouts).toContain("this.matchCaptionToValue();");
    expect(placeReadouts.indexOf("matchCaptionToValue")).toBeLessThan(
      placeReadouts.indexOf("this.scoreText.width"),
    );
  });
});

describe("ORDERS queue badge", () => {
  it("pins the count badge to the tablet screen top-right with a readable box", () => {
    const badgeBlock = between(shop, "this.queueBadge = addSignText(", ".setVisible(false)", "queueBadge");
    expect(badgeBlock).toMatch(/\.setOrigin\(0\.5,\s*0\.5\)/);
    expect(badgeBlock).toContain("noWrap: true");
    expect(badgeBlock).toContain('align: "center"');
    expect(badgeBlock).not.toContain("maxWidth:");
    expect(badgeBlock).not.toContain("maxHeight:");
    expect(badgeBlock).not.toContain("stroke:");
    expect(badgeBlock).not.toContain("strokeThickness:");
    expect(badgeBlock).toContain("padX: 18");
    expect(badgeBlock).toContain("padY: 16");
    expect(badgeBlock).toContain("inkShiftY: -4");
    expect(shop).toContain("private pinQueueBadge(");
  });

  it("reapplies badge position on syncTablet so layout cannot drift", () => {
    const sync = between(shop, "private syncTablet(snap: SimSnapshot, pulse: number, flash: boolean): void {", "\n  }", "syncTablet");
    expect(sync).toContain("this.queueBadge.setVisible(count >= 1)");
    expect(sync).toContain("this.pinQueueBadge(tab)");
    const pin = between(shop, "private pinQueueBadge(", "\n  }", "pinQueueBadge");
    expect(pin).toContain("setSignScrollFactor(this.queueBadge, 1, 1)");
    expect(pin).toContain("syncSignPlaque(this.queueBadge)");
    expect(pin).toContain("tab.left + tab.w");
    expect(pin).toContain("tab.top");
    expect(pin).toContain("setSignPlaqueCenter(this.queueBadge, cornerX, cornerY)");
  });
});

describe("ORDERS type size", () => {
  it("is seeded from the score's own constant rather than a copy of the number", () => {
    expect(readouts).toMatch(/HUD_SCORE_PX/);
    expect(shop).toMatch(/import \{[\s\S]*HUD_SCORE_PX[\s\S]*\} from "\.\.\/ui\/theme"/);
    expect(shop).toContain("const TABLET_LABEL_PX = HUD_SCORE_PX;");
    expect(ordersBlock).toContain('typeRolePx("hudTitle")');
  });

  it("pins ORDERS at the centre of the tablet screen bounds", () => {
    expect(shop).toContain("private pinTabletLabel(");
    expect(shop).toContain("tab.screenLeft + tab.screenW / 2");
    expect(shop).toContain("tab.screenTop + (tab.screenH - tab.homeH) / 2");
    expect(shop).not.toContain("TABLET_LABEL_X_NUDGE");
    expect(shop).not.toContain("TABLET_LABEL_Y_NUDGE");
    expect(shop).toContain("this.pinTabletLabel(tab)");
  });

  it("gives the label the whole tablet screen bar a hairline, because the seed will not fit", () => {
    // Measured in-browser at 1920x1080: the seed is 44px and the label renders at 33px,
    // its 135px of glyphs against a 136px box. Width is the binding constraint, so every
    // pixel of box is type size — an 8px inset a side, which is what this replaced, cost
    // 2px of rendered type. Clamp-fit sizes down from the ceiling, so the seed is a
    // cap and the rendered size has to be read off the live object, never assumed from here.
    expect(ORDERS_INSET).toBeLessThanOrEqual(2);
    expect(tab.screenW - ORDERS_INSET * 2).toBeGreaterThanOrEqual(136);
    // Caps tracking would have spent ~8% of that width on the gaps between six letters.
    expect(ordersBlock).toContain("letterSpacing: 0");
    expect(ordersBlock).toContain("noWrap: true");
  });
});
