import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COUNTER_SIGN } from "../maps/shopT0";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";

const here = dirname(fileURLToPath(import.meta.url));
/** core.autocrlf is true here, so a checkout delivers CRLF — normalise before matching. */
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

const hud = read("HudScene.ts");
const readouts = read("../ui/hud/readouts.ts");
const phone = read("../ui/hud/phone.ts");
const settings = read("../ui/hud/settings.ts");
const sign = read("../ui/signText.ts");
const budget = read("../ui/renderBudget.ts");
const slots = read("../ui/hud/slots.ts");
const placeChips = read("../ui/hud/placeChips.ts");

function between(text: string, start: string, end: string, what: string): string {
  const from = text.indexOf(start);
  if (from === -1) throw new Error(`${what}: start marker not found: ${JSON.stringify(start)}`);
  const to = text.indexOf(end, from + start.length);
  if (to === -1) throw new Error(`${what}: end marker not found: ${JSON.stringify(end)}`);
  return text.slice(from, to);
}

describe("HUD sign attachment guards", () => {
  it("positions sign chips through setSignPosition in layoutHud, not inner Text setPosition", () => {
    const layout = between(hud, "private layoutHud(): void {", "private paintHud", "layoutHud");
    expect(layout).toContain("this.readouts.layoutReadoutColumn(inset)");
    expect(layout).not.toMatch(/this\.cogCaption\.setPosition\(/);
    const readoutLayout = between(readouts, "layoutReadoutColumn(inset: SafeInset): void {", "\n  }", "layoutReadoutColumn");
    expect(readoutLayout).toContain("setSignPlaqueCenter(this.coverText");
    expect(readoutLayout).not.toMatch(/this\.coverText\.setPosition\(/);
  });

  it("parents score pop pool hosts, not inner Text, so plaques do not orphan at (0,0)", () => {
    const warm = between(readouts, "warmScorePopPool(): void {", "\n  }", "warmScorePopPool");
    expect(warm).toContain("this.scorePopLayer.add(signContainer(label))");
    expect(warm).not.toMatch(/this\.scorePopLayer\.add\(label\)/);
  });

  it("tweens the score pop host so plaque and glyphs rise together", () => {
    const pop = between(readouts, "spawnScorePop(delta: number, screen?: { x: number; y: number }): void {", "\n  }", "spawnScorePop");
    expect(pop).toContain("signContainer(label)");
    expect(pop).toMatch(/targets: popHost/);
    expect(pop).not.toMatch(/targets: label/);
    expect(pop).toContain("SCORE_POP_SCALE_MS");
    expect(pop).toContain("SCORE_POP_RISE_MS");
    expect(pop).toContain("scorePopPark");
    expect(pop).not.toContain("scorePopLayer.setPosition");
  });

  it("parks score pop anchors without moving the shared layer under SCORE", () => {
    const place = between(readouts, "placeReadouts(): void {", "\n  }", "placeReadouts");
    expect(place).toContain("this.scorePopPark = { x: signLeft, y: y - 46 }");
    expect(place).not.toContain("scorePopLayer.setPosition");
  });

  it("anchors shop readouts to the counter sign box when readoutsInShop", () => {
    const place = between(readouts, "placeReadouts(): void {", "\n  }", "placeReadouts");
    const project = between(readouts, "counterSignReadoutAnchors(): { signLeft: number; signRight: number; y: number } {", "\n  }", "counterSignReadoutAnchors");
    expect(place).toContain("if (this.readoutsInShop && !this.readoutsAtDoor)");
    expect(place).toContain("counterSignReadoutAnchors()");
    expect(place).toContain("this.scoreText.setOrigin(1, 0.5).setPosition(signLeft, y)");
    expect(place).toContain("this.clockText.setOrigin(0, 0.5).setPosition(signRight, y)");
    expect(project).toContain("worldToScreen(cam");
    expect(project).toContain("COUNTER_SIGN");
    expect(place).not.toContain("COUNTER_SIGN.y)");
    expect(place).not.toMatch(/setPosition\([^)]*,\s*0\s*\)/);
  });

  it("does not create or layout a Settings caption plaque", () => {
    expect(settings).not.toContain("cogCaption");
    const layout = between(settings, "layout(inset: SafeInset): void {", "\n  }", "settings layout");
    expect(layout).not.toContain("cogCaption");
    const create = between(settings, "create(): void {", "\n  }", "settings create");
    expect(create).not.toMatch(/addSignText\([^,]+,\s*0,\s*0,\s*"Settings"/);
  });

  it("exposes signHostPosition so callers never read inner Text x/y for layout", () => {
    expect(sign).toContain("export function signHostPosition");
  });

  it("keeps the HUD scene camera at zoom 1 with scroll pinned to the live backbuffer", () => {
    const sync = between(budget, "export function syncSceneRenderCamera(", "\n}", "syncSceneRenderCamera");
    expect(sync).toMatch(
      /if \(scene\.sys\.settings\.key === "hud"\)[\s\S]*cam\.setScroll\(0, 0\)/,
    );
  });
});

describe("HUD placement geometry", () => {
  it("places counter readouts on the sign row, not screen corners or floor band", () => {
    expect(COUNTER_SIGN.y).toBeLessThan(840);
    expect(COUNTER_SIGN.y).toBeGreaterThan(700);
    expect(COUNTER_SIGN.y - 76).toBeGreaterThan(400);
    expect(COUNTER_SIGN.x).toBeGreaterThan(GAME_WIDTH * 0.3);
    expect(COUNTER_SIGN.x).toBeLessThan(GAME_WIDTH * 0.7);
    expect(COUNTER_SIGN.y).toBeLessThan(GAME_HEIGHT - 200);
  });

  it("FAILS if SCORE is placed at raw COUNTER_SIGN without projection anchors", () => {
    const place = between(readouts, "placeReadouts(): void {", "\n  }", "placeReadouts");
    expect(place).not.toMatch(
      /readoutsInShop[\s\S]*setPosition\(COUNTER_SIGN\.x,\s*COUNTER_SIGN\.y\)/,
    );
    expect(place).not.toContain("setPosition(0, 0)");
  });

  it("FAILS if settings layout still references a caption host", () => {
    const layout = between(settings, "layout(inset: SafeInset): void {", "\n  }", "settings layout");
    expect(layout).not.toContain("cogCaption");
    expect(layout).toContain("cogY - cogSize");
  });
});

describe("HUD chip resolver wiring", () => {
  it("documents slot table and CHIP_GAP in slots.ts", () => {
    expect(slots).toContain("export const CHIP_GAP = 10");
    expect(slots).toContain("scoreClock");
    expect(slots).toContain("CHIP_PRIORITY");
  });

  it("resolves plaques once per frame from paintHud via resolveHudChips", () => {
    const paint = between(hud, "private paintHud(snap: SimSnapshot): void {", "private syncShopVisibility", "paintHud");
    expect(paint).toContain("resolveHudChips(");
    const resolve = between(hud, "private resolveHudChips(", "\n  }", "resolveHudChips");
    expect(resolve).toContain("beginChipFrame");
    expect(resolve).toContain("registerChipObstacle");
    expect(resolve).toMatch(/placeChip\([\s\S]*"toast"/);
    expect(placeChips).toContain("export function placeChip");
  });

  it("registers settings as cog-only before lower-priority chips", () => {
    expect(settings).toContain("registerChipObstacle");
    expect(settings).not.toContain("unionAabb");
  });

  it("draws shop counter SCORE/clock in ShopScene below customer speech", () => {
    expect(read("../ui/hud/constants.ts")).toContain("SHOP_COUNTER_READOUT_DEPTH = 9");
    expect(readouts).toContain("ensureShopReadouts");
    expect(readouts).toContain("syncShopReadoutMirror");
    expect(readouts).toContain("placeShopCounterReadouts");
    expect(readouts).toContain("shopReadoutsLayerActive");
    const chrome = between(readouts, "paintReadoutChrome(atDoor: boolean, showId: boolean", "\n  paintDoorTitle(", "paintReadoutChrome");
    expect(chrome).toContain("shopLayer");
    expect(chrome).toMatch(/showHudRow = !hide && !shopLayer/);
    expect(readouts).toContain("this.scene.scene.get(\"shop\")");
    expect(readouts).toContain("SHOP_COUNTER_READOUT_DEPTH");
    const ensure = between(readouts, "private ensureShopReadouts(): void {", "\n  /** World-space counter row", "ensureShopReadouts");
    expect(ensure).not.toContain("setScrollFactor(0)");
    const mirror = between(readouts, "private syncShopReadoutMirror(): void {", "\n  matchCaptionToValue(): void {", "syncShopReadoutMirror");
    expect(mirror).toContain("placeShopCounterReadouts()");
    expect(mirror).not.toMatch(/src\.x|src\.y/);
    const world = between(readouts, "private placeShopCounterReadouts(): void {", "\n  private syncShopReadoutMirror", "placeShopCounterReadouts");
    expect(world).toContain("COUNTER_SIGN.x - COUNTER_SIGN.w / 2 - HUD_SIGN_GAP");
    expect(world).toContain("COUNTER_SIGN.x + COUNTER_SIGN.w / 2 + HUD_SIGN_GAP");
    expect(world).toContain("COUNTER_SIGN.y");
    expect(world).toMatch(/while \(gap > 4/);
  });

  it("exposes shop HUD obstacle seeding for ShopScene chip resolve", () => {
    expect(hud).toContain("prepareShopChipObstacles(placer: ChipPlacer)");
    expect(readouts).toContain("registerShopHudObstacles(placer: ChipPlacer)");
    expect(readouts).toContain('"counterSign"');
  });

  it("places shop counter readouts on the sign row only", () => {
    const place = between(readouts, "placeReadouts(): void {", "\n  }", "placeReadouts");
    expect(place).toMatch(/readoutsInShop && !this\.readoutsAtDoor[\s\S]*counterSignReadoutAnchors/);
    expect(place).toMatch(/this\.clockText\.setOrigin\(0, 0\.5\)\.setPosition\(signRight, y\)/);
    expect(place).not.toMatch(/clockX/);
  });

  it("matches drive and door SCORE/clock size and corner pocket placement", () => {
    expect(readouts).toContain("doorCornerReadoutAnchors");
    expect(readouts).not.toContain("syncDriveReadoutScale");
    expect(readouts).not.toContain("DRIVE_HUD_SCORE_PX");
    const constants = read("../ui/hud/constants.ts");
    expect(constants).toMatch(/DOOR_CORNER_READOUT_PAD = 10/);
    expect(constants).toContain("DOOR_CORNER_POCKET_W");
    expect(constants).not.toContain("DRIVE_HUD_READOUT_SCALE");
    const place = between(readouts, "placeReadouts(): void {", "\n  }", "placeReadouts");
    expect(place).toMatch(/else[\s\S]*doorCornerReadoutAnchors/);
    expect(place).toMatch(/else[\s\S]*this\.clockText\.setOrigin\(1, 0\.5\)\.setPosition\(clockRight, rowY\)/);
    const anchor = between(readouts, "export function doorCornerReadoutAnchors(", "\n}", "doorCornerReadoutAnchors");
    expect(anchor).toContain("DOOR_CORNER_READOUT_PAD");
    expect(anchor).toContain("(pocketW - scoreRowW) / 2");
    expect(anchor).toContain("(pocketW - clockW) / 2");
  });

  it("resolves doorTitle top-center for the whole door visit", () => {
    const resolve = between(readouts, "resolvePlaqueSlots(", "\n  }", "resolvePlaqueSlots");
    expect(resolve).toContain("atDoor && this.doorTitleText.visible");
    expect(resolve).toMatch(/let centerX = placer\.viewW \/ 2/);
    expect(resolve).toMatch(/setSignPlaqueCenter\(this\.doorTitleText, centerX, centerY\)/);
    expect(resolve).toMatch(/readoutsInShop && !atDoor[\s\S]*unionAabb\(\[[\s\S]*textInkAabb\(this\.clockText\)/);
    expect(resolve).toMatch(/else[\s\S]*unionAabb\(\[textInkAabb\(this\.scoreCaption\), textInkAabb\(this\.scoreText\)\]\)/);
    expect(resolve).toMatch(/else[\s\S]*textInkAabb\(this\.clockText\)/);
    expect(resolve).toContain("scoreRight + CHIP_GAP");
    expect(resolve).toContain("clockLeft - CHIP_GAP");
    expect(resolve).toContain("placer.viewW / 2");
    expect(resolve).toMatch(/const centerY = this\.readoutCorner\.top/);
    expect(resolve).not.toMatch(/readoutCorner\.top \+ SLOT_GUTTER \+ plaque\.panelH/);
    const doorTitle = between(readouts, "paintDoorTitle(snap: SimSnapshot, atDoor: boolean", "\n  paintCover(", "paintDoorTitle");
    expect(doorTitle).toContain("setSignAccent(this.doorTitleText, Color.danger)");
    expect(doorTitle).toContain("HUD_DOOR_READOUT_DEPTH");
  });

  it("pins the delivery phone center-right on the HUD viewport", () => {
    const layout = between(phone, "layout(", "\n  }", "phone layout");
    expect(layout).toContain("viewW - 16 - inset.right");
    expect(layout).toContain("inset.top + (viewH - inset.top - inset.bottom) / 2");
    expect(layout).not.toContain("phoneBottom");
    expect(layout).not.toContain("cogTop - PHONE_COG_GAP");
  });

  it("keeps cover and doorTitle mutually exclusive — cover never paints at the porch", () => {
    const cover = between(readouts, "paintCover(", "\n  clipCoverLine(", "paintCover");
    expect(cover).toContain("!atDoor");
    expect(cover).toContain('snap.playerRole === "keyLead"');
    const resolve = between(readouts, "resolvePlaqueSlots(", "\n  }", "resolvePlaqueSlots");
    expect(resolve).toMatch(/if \(this\.coverText\.visible[\s\S]*placeChip\(placer, "cover"/);
    expect(resolve).toMatch(/if \(atDoor && this\.doorTitleText\.visible[\s\S]*setSignPlaqueCenter\(this\.doorTitleText/);
    expect(resolve).not.toMatch(/placeChip\(placer, "cover"[\s\S]*placeChip\(placer, "doorTitle"/);
    expect(resolve).not.toMatch(/placeChip\(placer, "doorTitle"[\s\S]*placeChip\(placer, "cover"/);
  });

  it("caps cover width so it cannot reach the shop lot mark", () => {
    const cover = between(readouts, "coverMaxWidth(): number {", "\n  }", "coverMaxWidth");
    expect(cover).toContain("Math.min");
    expect(cover).toContain("columnCap");
    expect(cover).toContain("scoreCap");
    const resolve = between(readouts, "resolvePlaqueSlots(", "\n  }", "resolvePlaqueSlots");
    expect(resolve).toContain('placeChip(placer, "cover"');
  });
});
