import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

describe("DriveScene grade throttle and dirty guards", () => {
  const src = read("DriveScene.ts");
  const hud = read("HudScene.ts");

  it("throttles applyDayNight with shouldApplyGrade (diag rank #3)", () => {
    expect(src).toContain("shouldApplyGrade");
    expect(src).toContain("lastGradeKey");
    expect(src).toContain("lastGradeMs");
    expect(src).toContain("DRIVE_GRADE_MIN_MS");
    expect(src).toContain("DRIVE_FOCUS_GRID");
    const paint = src.slice(src.indexOf("private paintDayNight"), src.indexOf("private paintNightGlow"));
    expect(paint).toContain("shouldApplyGrade");
    expect(paint).toContain("applyDayNight");
  });

  it("dirty-guards lot glow redraw", () => {
    expect(src).toContain("lastLotGlowKey");
    expect(src).toContain("stopId !== this.lastLotGlowKey");
    expect(src).toContain("shop:near");
    expect(src).toContain("returningHome");
  });

  it("skips paintDayNight when inactive", () => {
    const paint = src.slice(src.indexOf("private paintDayNight"), src.indexOf("private paintNightGlow"));
    expect(paint).toMatch(/if \(!this\.sys\.isActive\(\) \|\| this\.sys\.isSleeping\(\)\) return/);
  });

  it("removes PRE_RENDER day/night on SHUTDOWN", () => {
    expect(src).toContain("onPreRenderDayNight");
    expect(src).toContain("events.off(Phaser.Scenes.Events.PRE_RENDER, this.onPreRenderDayNight)");
  });

  it("builds the city map in chunked rows under warm", () => {
    expect(src).toContain("buildCityChunked");
    expect(src).toContain("drawCityTileRows");
    expect(src).toContain("yieldToRenderer");
    expect(src).toContain("cityBuildReady");
  });

  it("does not mount inverse-scale sign hosts on the drive scene", () => {
    expect(src).not.toContain("mountDriveSign");
    expect(src).not.toContain("syncDriveLabelScale");
    expect(src).not.toContain("pinLabelHost");
    expect(src).not.toContain("addSignText");
    expect(src).not.toContain("setSignCopy");
  });

  it("animates the pin from gameMs with no idle tweens", () => {
    expect(src).not.toContain("this.tweens.add");
    expect(src).toContain("PIN_CYCLE_MS");
    expect(src).toContain("Math.sin((snap.gameMs / PIN_CYCLE_MS)");
    const update = src.slice(src.indexOf("update(): void"), src.indexOf("private tutorialFlashHint"));
    expect(update).toContain("pinActive = !!stopId && this.sys.isActive()");
  });

  it("pins delivery plaque top-center on the HUD — no world projection", () => {
    expect(hud).toContain("paintDriveCallouts");
    const callouts = hud.slice(hud.indexOf("private paintDriveCallouts"), hud.indexOf("private tutorialFlashHint"));
    expect(callouts).toContain("placeInstructionChip(this.drivePinLabel");
    expect(callouts).not.toContain("worldToScreen");
    expect(hud).not.toContain("syncDriveLabelScale");
  });

  it("bakes static ground/props into RenderTextures and keeps movers live", () => {
    expect(src).toContain("bakeStaticCityMap");
    expect(src).toContain("staticBakeList");
    expect(src).toContain("CITY_BAKE_CELL");
    expect(src).toContain("renderTexture");
    expect(src).toContain("disableCull = false");
    expect(src).toContain("TRAFFIC_CULL_PAD");
    expect(src).toContain("enableItemHit(this.shopImg)");
    expect(src).toContain("this.vehicle");
    expect(src).toContain("trafficSprites");
    const bake = src.slice(src.indexOf("private async bakeStaticCityMap"), src.indexOf("private yieldToRenderer"));
    expect(bake).toMatch(/renderTexture\(x, y, w, h\)/);
    expect(bake).toContain("cam.setZoom(1)");
    expect(bake).not.toContain("bakeCellDimension");
    expect(bake).not.toContain("configureSceneBakeRT");
  });
});

describe("DoorScene grade throttle", () => {
  it("gates applyDayNight in PRE_RENDER like Drive (~80ms / dirty sky)", () => {
    const src = read("DoorScene.ts");
    expect(src).toContain("shouldApplyGrade");
    expect(src).toContain("lastGradeKey");
    expect(src).toContain("paintDoorDayNight");
    expect(src).toContain("onPreRenderDayNight");
    const block = src.slice(src.indexOf("private paintDoorDayNight"), src.indexOf("function doorFlashPhase"));
    expect(block).toContain("shouldApplyGrade");
    expect(block).toContain("applyDayNight");
    expect(block).toMatch(/if \(!this\.sys\.isActive\(\) \|\| this\.sys\.isSleeping\(\)\) return/);
  });
});
