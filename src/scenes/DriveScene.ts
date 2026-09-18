import Phaser from "phaser";
import { cityTileImageKey } from "../art/cityTileAtlas";
import { applyPersonTexture, personImageKey } from "../art/peopleAtlas";
import { driveGrade } from "../art/dayNightGrade";
import { applyDayNight, attachDayNight, dayNightFrom, shouldApplyGrade, type DayNightPipeline } from "../art/dayNightPipeline";
import { getRenderBudget, syncSceneRenderCamera } from "../ui/renderBudget";
import { wireSceneDayNightLifecycle } from "../ui/sceneDayNightLifecycle";
import { PIN_CYCLE_MS } from "./driveConstants";

export { PIN_CYCLE_MS } from "./driveConstants";
import {
  CITY,
  MAP_PX_H,
  MAP_PX_W,
  TILE,
  houseTitle,
  lotCenter,
  roadTextureKey,
  tileToWorld,
} from "../maps/cityT0";
import { cityAccessPaths, cityProps, cityStreetLamps, paintAccessPaths, paintHouseStreetSeams, type CityLamp } from "../maps/cityDecor";
import { cityTrafficLoops, trafficCars, type TrafficLoop } from "../maps/traffic";
import { enableItemHit } from "../input/hit";
import { PEOPLE_SCALE } from "../maps/shopT0";
import { getClockAlpha, getClockMode, getSimInterpolator } from "../sim/kindlingClock";
import { getSim } from "../session";
import { HANDOFF_RADIUS } from "../sim/constants";
import { skyAt } from "../sim/dayNight";
import { lerpAngle } from "../sim/driveRoute";
import type { SimSnapshot } from "../sim/gameSim";
import { tutorialHints, type TutorialHint } from "../sim/tutorialHints";
import { CITY_BUILD_ROWS_PER_CHUNK, markCityBuildComplete } from "../ui/cityBuild";
import { Color, Type } from "../ui/theme";
import { addUiText } from "../ui/text";
import { addMark, fitTypeToWidth, overlayStroke } from "../ui/typekit";

const HOUSE_TEX = ["tex-house", "tex-house-alt", "tex-house-3", "tex-house-4", "tex-house-5", "tex-house-6"];

/** Drive grade rebuild cadence — slower than shop; scrolling camera already moves view UVs. */
const DRIVE_GRADE_MIN_MS = 120;
/** Focus quantize grid — coarser than 32px cuts lamp-pool rebuilds while driving. */
const DRIVE_FOCUS_GRID = 64;
/**
 * Bake the static Drive map into ≤2048px RenderTexture cells so mobile GPUs stay
 * under typical max-texture-size (map is 4800×3360). Few draw calls; camera culls cells.
 */
const CITY_BAKE_CELL = 2048;
/** Extra world px around the camera before hiding traffic sprites (Phaser also culls). */
const TRAFFIC_CULL_PAD = 192;
const TRAFFIC_SPRITE_CAP = 12;

export class DriveScene extends Phaser.Scene {
  private vehicle!: Phaser.GameObjects.Image;
  private walker!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Graphics;
  private pin!: Phaser.GameObjects.Image;
  private pinPulse!: Phaser.GameObjects.Ellipse;
  private pinBase = { x: 0, y: 0 };
  private customer!: Phaser.GameObjects.Image;
  private shopImg!: Phaser.GameObjects.Image;
  private lastX = 0;
  private lastY = 0;
  private lighting?: DayNightPipeline;
  private streetLamps: CityLamp[] = [];
  private nightGlow!: Phaser.GameObjects.Graphics;
  private lastGlowKey = "";
  private lastGradeKey = "";
  private lastGradeMs = -1e9;
  private lastLotGlowKey = "";
  private lastTutorialHintKey = "";
  private cachedTutorialHint: TutorialHint | null = null;
  /** Grade focus from update — PRE_RENDER reads gameMs() only, not a full snapshot. */
  private dayNightFocus = { x: 0, y: 0 };
  private onPreRenderDayNight = (): void => {
    if (!this.sys.isActive() || this.sys.isSleeping()) return;
    this.paintDayNightAt(getSim().gameMs());
  };
  private trafficLoops: TrafficLoop[] = [];
  private trafficSprites: Phaser.GameObjects.Image[] = [];
  private trafficAngles = new Map<string, number>();
  private cityBuildReady = false;
  /** Ground/roads/houses/props/lamps/seams staged for bake, then destroyed. */
  private staticBakeList: Phaser.GameObjects.GameObject[] = [];
  private cityBakeLayers: Phaser.GameObjects.RenderTexture[] = [];

  constructor() {
    super("drive");
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, MAP_PX_W, MAP_PX_H);
    this.cameras.main.disableCull = false;
    this.cameras.main.setBackgroundColor(skyAt(0).mapGrass);
    syncSceneRenderCamera(this);
    this.lighting = attachDayNight(this.cameras.main);
    wireSceneDayNightLifecycle(this, this.cameras.main);
    void this.buildCityChunked();
    this.nightGlow = this.add.graphics().setDepth(2);
    this.glow = this.add.graphics().setDepth(3);
    this.paintDayNightAt(getSim().gameMs());
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, this.onPreRenderDayNight);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PRE_RENDER, this.onPreRenderDayNight);
    });
    this.pinPulse = this.add.ellipse(0, 0, 56, 22, Color.amber, 0.35).setDepth(4);
    this.pin = this.add
      .image(0, 0, "tex-pin")
      .setOrigin(0.5, 1)
      .setDepth(5)
      .setDisplaySize(72, 96)
      .setVisible(false);
    this.vehicle = this.add.image(0, 0, "tex-vehicle").setDepth(6).setDisplaySize(168, 104);
    this.walker = this.add.image(0, 0, "tex-driver").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(7).setVisible(false);
    const custTex = personImageKey("tex-customer-0");
    this.customer = this.add
      .image(0, 0, custTex.key, custTex.frame)
      .setOrigin(0.5, 1)
      .setScale(PEOPLE_SCALE)
      .setDepth(6)
      .setVisible(false);
    this.spawnTraffic();
  }

  private spawnTraffic(): void {
    this.trafficLoops = cityTrafficLoops();
    const sample = trafficCars(0, this.trafficLoops);
    this.trafficSprites = sample.map((car) =>
      this.add.image(0, 0, car.key).setDepth(5).setDisplaySize(120, 72).setAlpha(0.92),
    );
  }

  update(): void {
    if (!this.cityBuildReady) return;
    const snap = getSim().snapshot();
    const useInterp = getClockMode() === "fixedRaw";
    const alpha = getClockAlpha();
    const mover = useInterp ? getSimInterpolator().lerp(alpha) : null;
    const vehicle = mover?.vehicle ?? snap.vehicle;
    const driverOnFoot = mover?.driverOnFoot ?? snap.dropoff.driverOnFoot;
    const driver = mover?.driver ?? snap.dropoff.driver;

    this.vehicle.setPosition(vehicle.x, vehicle.y);
    this.vehicle.setAlpha(driverOnFoot ? 0.7 : 1);
    this.vehicle.setRotation(vehicle.heading + Math.PI);
    this.lastX = vehicle.x;
    this.lastY = vehicle.y;

    const traffic = getSim().trafficForDrive();
    const frameMs = this.game.loop.delta;
    const turnT = 1 - Math.exp(-(frameMs / 1000) * 6);
    const seen = new Set<string>();
    while (this.trafficSprites.length < traffic.length && this.trafficSprites.length < TRAFFIC_SPRITE_CAP) {
      this.trafficSprites.push(this.add.image(0, 0, "tex-car").setDepth(5).setDisplaySize(120, 72).setAlpha(0.92));
    }
    const view = this.cameras.main.worldView;
    const pad = TRAFFIC_CULL_PAD;
    this.trafficSprites.forEach((sprite, i) => {
      const car = traffic[i];
      if (!car) {
        sprite.setVisible(false);
        return;
      }
      const onScreen =
        car.x >= view.x - pad &&
        car.x <= view.x + view.width + pad &&
        car.y >= view.y - pad &&
        car.y <= view.y + view.height + pad;
      if (!onScreen) {
        sprite.setVisible(false);
        return;
      }
      seen.add(car.id);
      const prev = this.trafficAngles.get(car.id) ?? car.angle;
      const angle = lerpAngle(prev, car.angle, turnT);
      this.trafficAngles.set(car.id, angle);
      if (sprite.texture.key !== car.key) sprite.setTexture(car.key);
      sprite.setPosition(car.x, car.y).setRotation(angle + Math.PI);
      sprite.setVisible(true);
    });
    for (const id of this.trafficAngles.keys()) {
      if (!seen.has(id)) this.trafficAngles.delete(id);
    }

    const driving = snap.playerRole === "driver" && snap.dropoff.phase !== "atDoor";

    if (driverOnFoot && driver) {
      this.walker.setVisible(true).setPosition(driver.x, driver.y + 18);
      this.cameras.main.centerOn(driver.x, driver.y);
    } else {
      this.walker.setVisible(false);
      this.cameras.main.centerOn(vehicle.x, vehicle.y);
    }

    this.dayNightFocus =
      driverOnFoot && driver ? { x: driver.x, y: driver.y } : { x: vehicle.x, y: vehicle.y };

    // Day/night paints once in PRE_RENDER — avoid a second PostFX upload here.
    const next = this.tutorialFlashHint(snap);
    const stopId = snap.run?.nextStopId;
    const pinActive = !!stopId && this.sys.isActive();
    const pinPhase = pinActive ? 0.5 + 0.5 * Math.sin((snap.gameMs / PIN_CYCLE_MS) * Math.PI * 2) : 0;
    const pinBob = pinActive ? 8 + 8 * Math.sin((snap.gameMs / PIN_CYCLE_MS) * Math.PI * 2) : 0;
    if (stopId) {
      const house = CITY.houses.find((h) => h.id === stopId);
      if (house) {
        const x = house.stop.c * TILE + TILE / 2;
        const y = house.stop.r * TILE + TILE / 2;
        const home = lotCenter(house.house, house.lotW, house.lotH);
        const hw = house.lotW * TILE;
        const hh = house.lotH * TILE;
        if (stopId !== this.lastLotGlowKey) {
          this.lastLotGlowKey = stopId;
          this.glow.clear();
          this.glow.lineStyle(2, Color.lime, 0.9);
          this.glow.strokeRect(home.x - hw / 2 - 8, home.y - hh / 2 - 8, hw + 16, hh + 16);
        }
        this.pinBase.x = x;
        this.pinBase.y = y - 6;
        this.pin.setPosition(this.pinBase.x, this.pinBase.y - pinBob).setVisible(true);
        this.pinPulse
          .setPosition(x, y + 6)
          .setVisible(true)
          .setScale(1 + 0.25 * pinPhase, 1 + 0.15 * pinPhase);
        const flashPin = next?.kind === "gpsPin";
        this.pin.setTint(flashPin ? Color.flash : 0xffffff);
        this.pin.setAlpha(flashPin ? 0.62 + 0.38 * pinPhase : 1);
        this.pinPulse.setAlpha(flashPin ? 0.18 + 0.42 * pinPhase : 0.18 + 0.27 * pinPhase);
        this.pinPulse.setFillStyle(flashPin ? Color.lime : Color.amber, 1);
      }
    } else {
      if (this.lastLotGlowKey !== "") {
        this.lastLotGlowKey = "";
        this.glow.clear();
      }
      this.pin.setVisible(false);
      this.pinPulse.setVisible(false).setScale(1).setAlpha(0.35);
      this.pin.clearTint();
      this.pin.setAlpha(1);
    }

    if (snap.dropoff.customer) {
      applyPersonTexture(this.customer, snap.dropoff.customerLook ?? 0);
      this.customer.setVisible(true).setPosition(snap.dropoff.customer.x, snap.dropoff.customer.y + 10);
    } else {
      this.customer.setVisible(false);
    }

    const shop = tileToWorld(CITY.shopSpawn);
    const nearShop = Math.hypot(snap.vehicle.x - shop.x, snap.vehicle.y - shop.y) <= HANDOFF_RADIUS;
    const canTapShop = driving && nearShop;
    const flashShop = next?.kind === "shop";
    if (this.shopImg.input) this.shopImg.input.enabled = driving;
    this.shopImg.setTint(flashShop && canTapShop ? Color.flash : 0xffffff);
  }

  private tutorialFlashHint(snap: SimSnapshot): TutorialHint | null {
    const key = `${snap.selectedOrderId ?? ""}:${snap.playerRole}:${snap.dropoff.phase}:${snap.handSkuId ?? ""}:${snap.tabletTicket?.id ?? ""}`;
    if (key !== this.lastTutorialHintKey) {
      this.lastTutorialHintKey = key;
      this.cachedTutorialHint = tutorialHints(snap)[0] ?? null;
    }
    return this.cachedTutorialHint;
  }

  private paintDayNightAt(gameMs: number): void {
    if (!this.sys.isActive() || this.sys.isSleeping()) return;
    const sky = skyAt(gameMs);
    this.cameras.main.setBackgroundColor(sky.mapGrass);
    if (getRenderBudget().postFx) {
      const focus = this.dayNightFocus;
      // Coarse focus + sky key: view UVs refresh in the pipeline via syncViewFromCamera.
      const gradeKey = `${sky.mapOverlay}:${sky.mapOverlayAlpha.toFixed(3)}:${sky.lampAlpha.toFixed(2)}:${Math.round(focus.x / DRIVE_FOCUS_GRID)}:${Math.round(focus.y / DRIVE_FOCUS_GRID)}`;
      const now = performance.now();
      if (
        shouldApplyGrade({
          nowMs: now,
          lastMs: this.lastGradeMs,
          dirty: gradeKey !== this.lastGradeKey,
          minMs: DRIVE_GRADE_MIN_MS,
        })
      ) {
        this.lastGradeKey = gradeKey;
        this.lastGradeMs = now;
        const view = this.cameras.main.worldView;
        const pipe = this.lighting ?? dayNightFrom(this.cameras.main);
        this.lighting = pipe;
        applyDayNight(pipe, driveGrade(sky, focus, this.streetLamps), {
          x: view.x,
          y: view.y,
          width: view.width || this.scale.width,
          height: view.height || this.scale.height,
        });
      }
    }
    this.paintNightGlow(sky);
  }

  private paintNightGlow(sky: ReturnType<typeof skyAt>): void {
    if (!this.nightGlow) return;
    if (getRenderBudget().postFx) return;
    const view = this.cameras.main.worldView;
    const viewStep = 384;
    const bandSteps = 6;
    const viewCell = `${Math.round(view.x / viewStep)}:${Math.round(view.y / viewStep)}`;
    const key = `${(sky.windowGlow * bandSteps) | 0}:${(sky.lampAlpha * bandSteps) | 0}:${viewCell}`;
    if (key === this.lastGlowKey) return;
    this.lastGlowKey = key;
    this.nightGlow.clear();
    if (sky.windowGlow < 0.04 && sky.lampAlpha < 0.04) return;
    const pad = 48;
    const left = view.x - pad;
    const right = view.x + view.width + pad;
    const top = view.y - pad;
    const bottom = view.y + view.height + pad;
    if (sky.windowGlow >= 0.04) {
      const winA = 0.08 + 0.22 * sky.windowGlow;
      for (const house of CITY.houses) {
        const home = lotCenter(house.house, house.lotW, house.lotH);
        if (home.x < left || home.x > right || home.y < top || home.y > bottom) continue;
        this.nightGlow.fillStyle(0xffd080, winA);
        this.nightGlow.fillRect(home.x - 22, home.y - 16, 18, 14);
        this.nightGlow.fillRect(home.x + 6, home.y - 16, 18, 14);
      }
      const shop = lotCenter(CITY.shopLot.origin, CITY.shopLot.w, CITY.shopLot.h);
      if (shop.x >= left && shop.x <= right && shop.y >= top && shop.y <= bottom) {
        this.nightGlow.fillStyle(0xffe0a0, 0.08 + 0.3 * sky.windowGlow);
        this.nightGlow.fillRect(shop.x - 70, shop.y - 18, 36, 20);
        this.nightGlow.fillRect(shop.x + 8, shop.y - 18, 44, 20);
      }
    }
    if (sky.lampAlpha >= 0.04) {
      const lampA = 0.04 + 0.16 * sky.lampAlpha;
      const lampR = 18 + 8 * sky.lampAlpha;
      for (const lamp of this.streetLamps) {
        if (lamp.x < left || lamp.x > right || lamp.y < top || lamp.y > bottom) continue;
        this.nightGlow.fillStyle(0xffc070, lampA);
        this.nightGlow.fillCircle(lamp.x, lamp.y - 18, lampR);
      }
    }
  }

  private returnToShop(): void {
    const sim = getSim();
    const { role, dropoffPhase } = sim.rolePhase();
    if (role !== "driver") return;
    if (dropoffPhase === "atDoor") return;
    if (!sim.backToShop()) return;
    this.scene.sleep("drive");
    this.scene.sleep("door");
    this.scene.wake("shop");
    this.scene.bringToTop("hud");
  }

  /**
   * Incremental map build — yields between row batches so boot warm can respect
   * wall-clock deadlines on slow phones instead of blocking in one sync create().
   */
  private async buildCityChunked(): Promise<void> {
    const ctx = this.prepareCityDrawContext();
    const rowCount = CITY.kinds.length;
    for (let startRow = 0; startRow < rowCount; startRow += CITY_BUILD_ROWS_PER_CHUNK) {
      const endRow = Math.min(startRow + CITY_BUILD_ROWS_PER_CHUNK, rowCount);
      this.drawCityTileRows(ctx, startRow, endRow);
      await this.yieldToRenderer();
    }
    this.drawCityOverlays(ctx);
    // Collapse static Images/Graphics into a few RenderTextures — only movers stay live.
    await this.bakeStaticCityMap();
    markCityBuildComplete();
    this.cityBuildReady = true;
  }

  private prepareCityDrawContext(): CityDrawContext {
    return {
      houseTiles: new Set(CITY.houses.flatMap((h) => lotTileKeys(h.house, h.lotW, h.lotH))),
      shopTiles: new Set(lotTileKeys(CITY.shopLot.origin, CITY.shopLot.w, CITY.shopLot.h)),
    };
  }

  private drawCityTileRows(ctx: CityDrawContext, startRow: number, endRow: number): void {
    const kinds = CITY.kinds;
    for (let r = startRow; r < endRow; r++) {
      for (let c = 0; c < kinds[r]!.length; c++) {
        const kind = kinds[r]![c]!;
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;
        if (ctx.houseTiles.has(`${c},${r}`) || (kind === "shop" && ctx.shopTiles.has(`${c},${r}`))) {
          const grass = ["tex-wall", "tex-wall-2", "tex-wall-3"][(c * 3 + r * 5) % 3]!;
          this.trackStaticTile(x, y, grass);
          continue;
        }
        if (kind === "parking") {
          this.trackStaticTile(x, y, "tex-parking");
          continue;
        }
        const key =
          kind === "wall"
            ? ["tex-wall", "tex-wall-2", "tex-wall-3"][(c * 3 + r * 5) % 3]!
            : kind === "shop"
              ? "tex-shop"
              : kind === "house"
                ? HOUSE_TEX[(c + r) % HOUSE_TEX.length]!
                : roadTextureKey(kinds, r, c);
        this.trackStaticTile(x, y, key);
      }
    }
  }

  private trackStaticTile(x: number, y: number, key: string): void {
    const tex = cityTileImageKey(key);
    const img = (
      tex.frame
        ? this.add.image(x, y, tex.key, tex.frame)
        : this.add.image(x, y, tex.key)
    )
      .setDisplaySize(TILE, TILE)
      .setDepth(0);
    this.staticBakeList.push(img);
  }

  private drawCityOverlays(_ctx: CityDrawContext): void {
    CITY.houses.forEach((house, i) => {
      const home = lotCenter(house.house, house.lotW, house.lotH);
      const tex = HOUSE_TEX[i % HOUSE_TEX.length]!;
      const roof = this.add
        .image(home.x, home.y, tex)
        .setDisplaySize(house.lotW * TILE * 0.98, house.lotH * TILE * 0.96)
        .setDepth(1);
      this.staticBakeList.push(roof);
      // Lot numbers stay live Text (few objects; baking Text is fragile).
      const num = addUiText(this, home.x, home.y - 8, houseTitle(house.id).replace("House ", ""), {
        size: Type.body,
        color: Color.creamHex,
        fontStyle: "700",
        maxWidth: house.lotW * TILE - 36,
        maxHeight: 28,
        ...overlayStroke(12),
      })
        .setOrigin(0.5)
        .setDepth(2);
      fitTypeToWidth(num, house.lotW * TILE - 36);
    });

    // Seams + walks above grass, clipped under roofs but over lot edge / pad lips.
    const accessGfx = this.add.graphics().setDepth(1.2);
    paintHouseStreetSeams(accessGfx);
    paintAccessPaths(accessGfx, cityAccessPaths());
    this.staticBakeList.push(accessGfx);

    const shop = lotCenter(CITY.shopLot.origin, CITY.shopLot.w, CITY.shopLot.h);
    // Interactive shop building stays live for hit testing / return-to-shop.
    this.shopImg = this.add
      .image(shop.x, shop.y, "tex-shop-bldg")
      .setDisplaySize(CITY.shopLot.w * TILE, CITY.shopLot.h * TILE)
      .setDepth(1);
    enableItemHit(this.shopImg);
    this.shopImg.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      this.returnToShop();
    });
    const mark = addMark(this, shop.x, shop.y - CITY.shopLot.h * TILE * 0.3, {
      size: Type.heading,
      color: Color.creamHex,
      maxWidth: CITY.shopLot.w * TILE - 32,
      maxHeight: 36,
      ...overlayStroke(16),
    })
      .setOrigin(0.5)
      .setDepth(2);
    fitTypeToWidth(mark, CITY.shopLot.w * TILE - 32);

    this.streetLamps = cityStreetLamps();
    for (const lamp of this.streetLamps) {
      // Lamp poles are static; nightGlow Graphics still paints pools each frame.
      const img = this.add.image(lamp.x, lamp.y, "tex-lamp").setDisplaySize(36, 88).setDepth(2);
      this.staticBakeList.push(img);
    }
    for (const prop of cityProps()) {
      const img = this.add.image(prop.x, prop.y, prop.key).setDepth(prop.depth);
      if (prop.display) img.setDisplaySize(prop.display.w, prop.display.h);
      else img.setDisplaySize(TILE, TILE);
      this.staticBakeList.push(img);
    }
  }

  /**
   * Bake ground/roads/static props into a grid of RenderTextures, then destroy the
   * per-tile Images. Live sprites after this: vehicle, walker, traffic, pins,
   * interactive shop, texts, and night/lot glow Graphics.
   *
   * Full design-resolution cells at camera zoom 1 — tier-scaled RT + configureSceneBakeRT
   * misaligned roads/lots vs the van (same root cause as Door #119 / shop interior).
   * Keep ≤2048px tiling for GPU max-texture-size; do not shrink by renderScale.
   */
  private async bakeStaticCityMap(): Promise<void> {
    const layers = [...this.staticBakeList].sort((a, b) => {
      const da = "depth" in a ? Number((a as { depth: number }).depth) : 0;
      const db = "depth" in b ? Number((b as { depth: number }).depth) : 0;
      return da - db;
    });
    const cam = this.cameras.main;
    const savedZoom = cam.zoom;
    const savedScrollX = cam.scrollX;
    const savedScrollY = cam.scrollY;
    cam.setZoom(1);
    cam.setScroll(0, 0);

    for (let y = 0; y < MAP_PX_H; y += CITY_BAKE_CELL) {
      for (let x = 0; x < MAP_PX_W; x += CITY_BAKE_CELL) {
        const w = Math.min(CITY_BAKE_CELL, MAP_PX_W - x);
        const h = Math.min(CITY_BAKE_CELL, MAP_PX_H - y);
        const rt = this.add.renderTexture(x, y, w, h).setOrigin(0, 0).setDepth(0);
        rt.camera.setZoom(1);
        rt.camera.setScroll(x, y);
        rt.beginDraw();
        for (const obj of layers) {
          if (!staticIntersectsBakeCell(obj, x, y, w, h)) continue;
          rt.batchDraw(obj);
        }
        rt.endDraw();
        this.cityBakeLayers.push(rt);
        await this.yieldToRenderer();
      }
    }

    cam.setZoom(savedZoom);
    cam.setScroll(savedScrollX, savedScrollY);
    for (const obj of this.staticBakeList) obj.destroy();
    this.staticBakeList = [];
  }

  /** Yield one frame — wall-clock fallback when Phaser time freezes during sync work. */
  private yieldToRenderer(): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        resolve();
      };
      this.game.events.once(Phaser.Core.Events.POST_RENDER, finish);
      globalThis.setTimeout(finish, 80);
    });
  }
}

type CityDrawContext = {
  houseTiles: Set<string>;
  shopTiles: Set<string>;
};

function lotTileKeys(origin: { c: number; r: number }, w: number, h: number): string[] {
  const keys: string[] = [];
  for (let r = origin.r; r < origin.r + h; r++) {
    for (let c = origin.c; c < origin.c + w; c++) keys.push(`${c},${r}`);
  }
  return keys;
}

/** True when a static Image/Graphics likely paints inside a bake cell (Graphics always). */
function staticIntersectsBakeCell(
  obj: Phaser.GameObjects.GameObject,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
): boolean {
  if (!("x" in obj) || !("y" in obj)) return true;
  const x = Number((obj as { x: number }).x);
  const y = Number((obj as { y: number }).y);
  const dw =
    "displayWidth" in obj ? Number((obj as { displayWidth: number }).displayWidth) : TILE * 2;
  const dh =
    "displayHeight" in obj ? Number((obj as { displayHeight: number }).displayHeight) : TILE * 2;
  // Graphics path overlays have no useful display size — always stamp (camera clips).
  if (!("texture" in obj)) return true;
  const halfW = dw / 2;
  const halfH = dh / 2;
  return x + halfW >= cellX && x - halfW <= cellX + cellW && y + halfH >= cellY && y - halfH <= cellY + cellH;
}
