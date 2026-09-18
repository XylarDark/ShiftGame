import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string): string => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("scene perf guards", () => {
  it("Drive skips redundant night glow when PostFX is on", () => {
    const src = read("src/scenes/DriveScene.ts");
    const glow = src.slice(src.indexOf("private paintNightGlow"), src.indexOf("private returnToShop"));
    expect(glow).toContain("if (getRenderBudget().postFx) return");
  });

  it("Drive and Door skip PRE_RENDER / paint when inactive", () => {
    const drive = read("src/scenes/DriveScene.ts");
    const door = read("src/scenes/DoorScene.ts");
    expect(drive).toMatch(/if \(!this\.sys\.isActive\(\) \|\| this\.sys\.isSleeping\(\)\) return/);
    expect(drive).toMatch(/onPreRenderDayNight[\s\S]*if \(!this\.sys\.isActive\(\) \|\| this\.sys\.isSleeping\(\)\) return/);
    expect(door).toContain("onPreRenderDayNight");
    expect(door).toMatch(/if \(!this\.sys\.isActive\(\) \|\| this\.sys\.isSleeping\(\)\) return/);
    const doorSync = door.slice(door.indexOf("private sync(snap"), door.indexOf("private paintDoorDayNight"));
    expect(doorSync).not.toContain("applyDayNight");
  });

  it("Hud locks render tier on coarse — tick only on desktop", () => {
    const hud = read("src/scenes/HudScene.ts");
    expect(hud).toContain("tickRenderBudget");
    expect(hud).not.toContain("syncRenderStress");
    expect(hud).not.toContain("applyRenderBudgetToGame");
  });

  it("driveGrade avoids full lamp sort", () => {
    const grade = read("src/art/dayNightGrade.ts");
    const drive = grade.slice(grade.indexOf("export function driveGrade"), grade.indexOf("export function doorGrade"));
    expect(drive).toContain("nearestLamps");
    expect(drive).not.toContain(".sort(");
  });

  it("Drive caps traffic sprite pool with a fixed constant", () => {
    const drive = read("src/scenes/DriveScene.ts");
    expect(drive).toContain("TRAFFIC_SPRITE_CAP");
    const update = drive.slice(drive.indexOf("update(): void"), drive.indexOf("private paintDayNight"));
    expect(update).toContain("TRAFFIC_SPRITE_CAP");
  });

  it("Drive and Door use fixed phone Graphics FX without tier invalidation", () => {
    const drive = read("src/scenes/DriveScene.ts");
    const door = read("src/scenes/DoorScene.ts");
    expect(drive).not.toContain("phoneFxQuality");
    expect(door).not.toContain("phoneFxQuality");
    expect(door).not.toContain("lastFxQuality");
    const glow = drive.slice(drive.indexOf("private paintNightGlow"), drive.indexOf("private returnToShop"));
    expect(glow).toContain("lastGlowKey");
    expect(glow).not.toContain("quality");
  });

  it("Hud reuses a capped score pop pool instead of destroy-per-flash", () => {
    const readouts = read("src/ui/hud/readouts.ts");
    expect(readouts).toContain("SCORE_POP_POOL");
    expect(readouts).toContain("warmScorePopPool");
    expect(readouts).toContain("acquireScorePop");
    expect(readouts).toContain("releaseScorePop");
    const pop = readouts.slice(readouts.indexOf("spawnScorePop(delta: number): void {"), readouts.indexOf("}\n"));
    expect(pop).not.toContain("label.destroy()");
  });

  it("Door dirty-guards prompt setText", () => {
    const door = read("src/scenes/DoorScene.ts");
    expect(door).toContain("lastPrompt");
    const sync = door.slice(door.indexOf("private sync(snap"), door.indexOf("private paintDoorDayNight"));
    expect(sync).toContain("if (promptLine !== this.lastPrompt)");
  });

  it("Shop dirty-guards bag texture and TV pulse bands", () => {
    const shop = read("src/scenes/ShopScene.ts");
    expect(shop).toContain("lastTvKey");
    expect(shop).toContain("if (this.bagRack.texture.key !== bagTex)");
    expect(shop).toContain("getSim().gameMs()");
  });

  it("Shop hotspots ack before sim — wireShopTap, no snapshot on pointerdown", () => {
    const shop = read("src/scenes/ShopScene.ts");
    expect(shop).toContain("wireShopTap");
    expect(shop).toContain("ackTap");
    expect(shop).toContain("tabletTicketId");
    expect(shop).not.toMatch(/pointerdown[\s\S]{0,120}snapshot\(/);
  });

  it("Hud skips pre-tick snapshot and dirty-guards ID/pad/phone map", () => {
    const hud = read("src/scenes/HudScene.ts");
    const phone = read("src/ui/hud/phone.ts");
    const update = hud.slice(hud.indexOf("update(_time"), hud.indexOf("private layoutHud"));
    expect(update).toContain("isAutoDriving()");
    expect(update).not.toContain("const pre = sim.snapshot()");
    expect(hud).toContain("lastIdTextKey");
    expect(hud).toContain("lastPadFlash");
    expect(phone).toContain("lastPhoneMapKey");
  });

  it("every gameplay scene re-syncs camera zoom on create (RenderBudget race fix)", () => {
    for (const rel of [
      "src/scenes/ShopScene.ts",
      "src/scenes/DriveScene.ts",
      "src/scenes/DoorScene.ts",
      "src/scenes/HudScene.ts",
      "src/scenes/TitleScene.ts",
    ]) {
      const src = read(rel);
      expect(src).toContain("syncSceneRenderCamera(this)");
    }
  });

  it("Drive skips redundant traffic setTexture when key unchanged", () => {
    const drive = read("src/scenes/DriveScene.ts");
    const update = drive.slice(drive.indexOf("update(): void"), drive.indexOf("private paintDayNight"));
    expect(update).toContain("if (sprite.texture.key !== car.key) sprite.setTexture(car.key)");
  });

  it("Shop bakes static interior into RenderTextures", () => {
    const shop = read("src/scenes/ShopScene.ts");
    expect(shop).toContain("bakeStaticShop");
    expect(shop).toContain("shopBakeLayers");
    expect(shop).toContain("drawShopInterior(this)");
  });

  it("Door bakes static facade into a RenderTexture", () => {
    const door = read("src/scenes/DoorScene.ts");
    expect(door).toContain("bakeDoorFacade");
    expect(door).toContain("paintDoorstepStatic");
    expect(door).toContain("skyVisualDirtyKey");
  });

  it("Boot registers atlases after generateTextures and flushes before people pack", () => {
    const boot = read("src/scenes/BootScene.ts");
    expect(boot).toContain("registerCityTileAtlas");
    expect(boot).toContain("registerPeopleAtlases");
    const art = boot.indexOf("generateTextures(this)");
    const cityAtlas = boot.indexOf("registerCityTileAtlas(this)");
    const firstFlush = boot.indexOf("await this.flushTextures()", cityAtlas);
    const peopleAtlas = boot.indexOf("registerPeopleAtlases(this)");
    expect(art).toBeGreaterThan(-1);
    expect(cityAtlas).toBeGreaterThan(art);
    expect(firstFlush).toBeGreaterThan(cityAtlas);
    expect(peopleAtlas).toBeGreaterThan(firstFlush);
  });

  it("Hud update never calls layoutHud or unguarded refitType", () => {
    const hud = read("src/scenes/HudScene.ts");
    const update = hud.slice(hud.indexOf("update(_time"), hud.indexOf("private layoutHud"));
    expect(update).not.toContain("layoutHud");
    expect(update).not.toContain("refitType");
  });

  it("Hud caches tutorial hints and gates scene/music sync", () => {
    const hud = read("src/scenes/HudScene.ts");
    const readouts = read("src/ui/hud/readouts.ts");
    const settings = read("src/ui/hud/settings.ts");
    expect(hud).toContain("tutorialFlashHint");
    expect(hud).toContain("lastTutorialHintKey");
    expect(hud).toContain("syncMusicIfNeeded");
    expect(hud).toContain("skyVisualDirtyKey");
    expect(hud).toContain("lastDriveSceneKey");
    expect(hud).toContain("lastDoorSceneKey");
    expect(hud).toContain("lastShowPhone");
    expect(settings).toContain("volumeTrackBounds");
    const cover = readouts.slice(readouts.indexOf("paintCover("), readouts.indexOf("coverMaxWidth(): number"));
    expect(cover).not.toContain("setPosition");
    const layout = hud.slice(hud.indexOf("private layoutHud"), hud.indexOf("private paintHud"));
    expect(layout).toContain("this.readouts.layoutReadoutColumn(inset)");
  });

  it("Drive PRE_RENDER grades from gameMs and culls traffic before transforms", () => {
    const drive = read("src/scenes/DriveScene.ts");
    expect(drive).toContain("paintDayNightAt(getSim().gameMs())");
    expect(drive).toContain("dayNightFocus");
    const update = drive.slice(drive.indexOf("update(): void"), drive.indexOf("private tutorialFlashHint"));
    expect(update).toMatch(/if \(!onScreen\)[\s\S]*setVisible\(false\)[\s\S]*return[\s\S]*setTexture/);
    expect(drive).toContain("rolePhase()");
  });

  it("gameSim dirty-guards customer bubbles and exposes rolePhase", () => {
    const sim = read("src/sim/gameSim.ts");
    expect(sim).toContain("customerBubbleInputsKey");
    expect(sim).toContain("customerBubbleView");
    expect(sim).toContain("keyLeadCalloutInputsKey");
    expect(sim).toContain("rolePhase()");
  });

  it("arcade physics removed when unused", () => {
    const config = read("src/config.ts");
    expect(config).not.toContain("physics:");
  });

  it("camera shutter noise buffer is prewarmed once", () => {
    const sfx = read("src/audio/sfx.ts");
    expect(sfx).toContain("prewarmCameraSfx");
    expect(sfx).toContain("shutterNoiseBuffer");
    const click = sfx.slice(sfx.indexOf("export function playCameraClick"), sfx.indexOf("export function playUiSfx"));
    expect(click).not.toContain("createBuffer(");
  });

  it("tick patches snap cache in place instead of touch() at entry", () => {
    const sim = read("src/sim/gameSim.ts").replace(/\r\n/g, "\n");
    const tickStart = sim.indexOf("tick(dtMs: number): void {");
    const tickEnd = sim.indexOf("orderById(id: string)", tickStart);
    const tick = sim.slice(tickStart, tickEnd);
    expect(tick).toContain("patchSnapCacheFromTick");
    expect(tick).not.toMatch(/tick\(dtMs: number\): void \{\s*if \(this\.shiftEnded\) return;\s*this\.touch\(\)/);
  });

  it("pathfinding uses a heap cache and setVehiclePosition does not repath", () => {
    const path = read("src/sim/pathfinding.ts");
    expect(path).toContain("class MinHeap");
    expect(path).not.toContain("open.sort");
    const sim = read("src/sim/gameSim.ts");
    const setPos = sim.slice(sim.indexOf("setVehiclePosition(x: number"), sim.indexOf("spawnOrder(type:"));
    expect(setPos).not.toContain("refreshDriveRoute");
    expect(sim).toContain("driveRouteDestKey");
  });

  it("Boot pre-warms shop→house drive paths under the loading gate", () => {
    const boot = read("src/scenes/BootScene.ts");
    expect(boot).toContain("warmDriveDeparturePaths");
  });

  it("sign plaques share one PRE_RENDER pump per scene", () => {
    const sign = read("src/ui/signText.ts");
    expect(sign).toContain("SceneSignPlaquePump");
    expect(sign).toContain("layoutPlaque");
  });

  it("Drive and tickDrive share one trafficCars list per sim step", () => {
    const sim = read("src/sim/gameSim.ts");
    expect(sim).toContain("trafficForDrive");
    expect(sim).toContain("trafficCacheMs");
    const drive = read("src/scenes/DriveScene.ts");
    const update = drive.slice(drive.indexOf("update(): void"), drive.indexOf("private paintDayNight"));
    expect(update).toContain("getSim().trafficForDrive()");
    expect(update).not.toMatch(/trafficCars\(/);
  });

  it("Drive/shop/door static bakes stamp at design size and camera zoom 1", () => {
    const shop = read("src/scenes/ShopScene.ts");
    const drive = read("src/scenes/DriveScene.ts");
    const door = read("src/scenes/DoorScene.ts");
    const bakeShop = shop.slice(shop.indexOf("private bakeStaticShop"), shop.indexOf("private warmCustomerPool"));
    expect(bakeShop).toMatch(/renderTexture\(0, 0, GAME_WIDTH, GAME_HEIGHT\)/);
    expect(bakeShop).not.toContain("sceneBakeDimensions");
    expect(bakeShop).not.toContain("configureSceneBakeRT");
    expect(bakeShop).toContain("cam.setZoom(1)");
    const bakeCity = drive.slice(drive.indexOf("private async bakeStaticCityMap"), drive.indexOf("private yieldToRenderer"));
    expect(bakeCity).toMatch(/renderTexture\(x, y, w, h\)/);
    expect(bakeCity).toContain("cam.setZoom(1)");
    expect(bakeCity).toContain("rt.camera.setZoom(1)");
    expect(bakeCity).not.toContain("bakeCellDimension");
    expect(bakeCity).not.toContain("configureSceneBakeRT");
    const bakeDoor = door.slice(door.indexOf("private bakeDoorFacade"), door.indexOf("private paintDoorDayNight"));
    expect(bakeDoor).toMatch(/renderTexture\(0, 0, GAME_WIDTH, GAME_HEIGHT\)/);
    expect(bakeDoor).toContain("cam.setZoom(1)");
  });
});
