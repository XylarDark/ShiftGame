import Phaser from "phaser";
import { houseTitle } from "../../maps/cityT0";
import { COUNTER_SIGN } from "../../maps/shopT0";
import { GAME_HEIGHT, GAME_WIDTH } from "../../sim/constants";
import type { SimSnapshot } from "../../sim/gameSim";
import { formatSlaClock } from "../copy";
import { parseFontPx, retypeSize } from "../typekit";
import {
  addSignText,
  setSignAccent,
  setSignCopy,
  setSignPlaqueCenter,
  setSignPosition,
  signContainer,
  signPlaqueExtents,
  signPlaqueMid,
  syncSignPlaque,
} from "../signText";
import { inkFontSizePx, inkSetStroke } from "../typeInk";
import { addUiText, type UiInk } from "../text";
import { Color, HUD_READOUT_PX, HUD_SCORE_PX } from "../theme";
import { typeClockPx, typeRoleBox, typeRolePx } from "../typeScale";
import { worldToScreen } from "../worldProject";
import { designHudInset, hudSceneViewport, readCssSafeArea, type SafeInset } from "../viewFit";
import {
  DOOR_CORNER_POCKET_W,
  DOOR_CORNER_READOUT_PAD,
  HUD_CORNER_TOP,
  HUD_DOOR_READOUT_DEPTH,
  HUD_READOUT_DEPTH,
  HUD_SCORE_GAP,
  HUD_SIGN_GAP,
  readoutOutline,
  SCORE_POP_POOL,
  SCORE_POP_RISE_MS,
  SCORE_POP_SCALE_MS,
  SHOP_COUNTER_READOUT_DEPTH,
} from "./constants";
import type { ChipPlacer } from "./chipCollision";
import { placeChip, textInkAabb, unionAabb } from "./placeChips";
import { CHIP_GAP, chipPriority, SLOT_GUTTER } from "./slots";

/** Drive and door — center SCORE row and clock in corner pockets with even edge air. */
export function doorCornerReadoutAnchors(
  inset: SafeInset,
  viewW: number,
  top: number,
  scoreRowW: number,
  clockW: number,
): { scoreLeft: number; clockRight: number; rowY: number } {
  const pad = DOOR_CORNER_READOUT_PAD;
  const pocketW = Math.min(DOOR_CORNER_POCKET_W, (viewW - inset.left - inset.right) * 0.24);
  const rowY = top + pad;
  const safeLeft = inset.left + pad;
  const safeRight = viewW - inset.right - pad;
  const scoreLeft = safeLeft + Math.max(0, (pocketW - scoreRowW) / 2);
  const clockRight = safeRight - Math.max(0, (pocketW - clockW) / 2);
  return { scoreLeft, clockRight, rowY };
}

/** Plaque center when the panel's top-left corner sits at `(left, top)`. */
function plaqueCenterFromTopLeft(
  text: UiInk,
  left: number,
  top: number,
): { x: number; y: number } {
  syncSignPlaque(text);
  const ext = signPlaqueExtents(text);
  const mid = signPlaqueMid(text);
  return { x: left + mid.midX - ext.leftLocal, y: top + mid.midY - ext.topLocal };
}

export interface ReadoutCorner {
  left: number;
  right: number;
  top: number;
}

export interface HudReadoutsChrome {
  cog: Phaser.GameObjects.Image;
  settingsOpen: boolean;
  resultsVisible: boolean;
  releaseScorePop(label: UiInk): void;
}

/**
 * Score, clock, cover, and door-title readouts. Shop mode anchors to the counter
 * KINDLING plaque via screen projection; corner mode is the road fallback.
 */
export class HudReadouts {
  scoreText!: UiInk;
  scoreCaption!: UiInk;
  clockText!: UiInk;
  coverText!: UiInk;
  doorTitleText!: UiInk;
  scorePopLayer!: Phaser.GameObjects.Container;

  private captionPx = HUD_SCORE_PX;
  readoutsInShop = true;
  /** Driver at the doorstep — SCORE top-left, clock top-right; orange status top-center. */
  readoutsAtDoor = false;
  readoutCorner: ReadoutCorner = { left: 28, right: GAME_WIDTH - 28, top: HUD_CORNER_TOP };
  private lastDoorTitle = "";
  private lastReadoutsHidden: boolean | null = null;
  /** Shop-owned counter row — HudScene duplicates hide while this is active. */
  private lastShopReadoutsLayer: boolean | null = null;
  private shopScoreText?: UiInk;
  private shopScoreCaption?: UiInk;
  private shopClockText?: UiInk;
  private scorePopPool: UiInk[] = [];
  private scorePopFree: UiInk[] = [];
  /** Parked screen anchor for score pops that are not actor-projected. */
  private scorePopPark = { x: 0, y: 0 };

  constructor(private readonly scene: Phaser.Scene) {}

  create(): void {
    this.scoreText = addUiText(this.scene, 0, 0, "", {
      size: typeRolePx("hudTitle"),
      typeRole: "hudTitle",
      color: Color.creamHex,
      fontStyle: "700",
      align: "right",
      ...readoutOutline(HUD_SCORE_PX),
    })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(HUD_READOUT_DEPTH);

    this.scoreCaption = addUiText(this.scene, 0, 0, "SCORE", {
      size: typeRolePx("hudTitle"),
      typeRole: "hudTitle",
      color: Color.creamHex,
      fontStyle: "700",
      align: "right",
      letterSpacing: 2,
      ...readoutOutline(HUD_SCORE_PX),
    })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(HUD_READOUT_DEPTH);

    this.scorePopLayer = this.scene.add.container(0, 0).setDepth(30);
    this.warmScorePopPool();

    this.clockText = addUiText(this.scene, 0, 0, "", {
      size: typeClockPx(),
      color: Color.creamHex,
      fontStyle: "700",
      ...readoutOutline(HUD_READOUT_PX),
    })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(HUD_READOUT_DEPTH);

    this.coverText = addSignText(this.scene, 0, 0, "", {
      size: typeRolePx("hudSmall"),
      typeRole: "hudSmall",
      fontStyle: "600",
      noWrap: true,
      maxWidth: typeRoleBox(280, "hudSmall"),
      maxHeight: typeRoleBox(40, "hudSmall"),
    })
      .setOrigin(0, 0)
      .setDepth(HUD_READOUT_DEPTH)
      .setVisible(false);

    this.doorTitleText = addSignText(this.scene, 0, 0, "", {
      size: typeRolePx("hudBody"),
      typeRole: "hudBody",
      fontStyle: "700",
      noWrap: true,
      maxWidth: typeRoleBox(900, "hudBody"),
      maxHeight: typeRoleBox(48, "hudBody"),
    })
      .setOrigin(0, 0.5)
      .setDepth(HUD_READOUT_DEPTH)
      .setVisible(false);
  }

  layoutReadoutColumn(inset: SafeInset): void {
    const g = SLOT_GUTTER;
    const left = inset.left + g;
    const right = GAME_WIDTH - inset.right - g;
    this.readoutCorner = { left, right, top: HUD_CORNER_TOP + inset.top };
    const coverCenter = plaqueCenterFromTopLeft(this.coverText, left, this.readoutCorner.top + 40);
    setSignPlaqueCenter(this.coverText, coverCenter.x, coverCenter.y);
  }

  /**
   * Project the counter-sign row through the live shop camera. HUD stays at zoom 1 while
   * the shop may render at renderScale, so raw COUNTER_SIGN coords drift off the plaque
   * on phones unless they are screen-projected like drive callouts.
   */
  counterSignReadoutAnchors(): { signLeft: number; signRight: number; y: number } {
    const shop = this.scene.scene.get("shop") as Phaser.Scene | undefined;
    if (shop?.sys.isActive()) {
      const cam = shop.cameras.main;
      const y = COUNTER_SIGN.y;
      const leftX = COUNTER_SIGN.x - COUNTER_SIGN.w / 2 - HUD_SIGN_GAP;
      const rightX = COUNTER_SIGN.x + COUNTER_SIGN.w / 2 + HUD_SIGN_GAP;
      return {
        signLeft: worldToScreen(cam, leftX, y).x,
        signRight: worldToScreen(cam, rightX, y).x,
        y: worldToScreen(cam, COUNTER_SIGN.x, y).y,
      };
    }
    return {
      signLeft: COUNTER_SIGN.x - COUNTER_SIGN.w / 2 - HUD_SIGN_GAP,
      signRight: COUNTER_SIGN.x + COUNTER_SIGN.w / 2 + HUD_SIGN_GAP,
      y: COUNTER_SIGN.y,
    };
  }

  placeReadouts(): void {
    this.matchCaptionToValue();
    const valueW = this.scoreText.width;
    const captionW = this.scoreCaption.width;
    if (this.readoutsInShop && !this.readoutsAtDoor) {
      const { signLeft, signRight, y } = this.counterSignReadoutAnchors();
      let gap = HUD_SCORE_GAP;
      const signInnerLeft = COUNTER_SIGN.x - COUNTER_SIGN.w / 2;
      while (gap > 4 && signLeft - valueW - gap - captionW < signInnerLeft - 8) {
        gap -= 2;
      }
      this.scoreText.setOrigin(1, 0.5).setPosition(signLeft, y);
      this.scoreCaption.setOrigin(1, 0.5).setPosition(signLeft - valueW - gap, y);
      this.clockText.setOrigin(0, 0.5).setPosition(signRight, y);
      // Park only — never move scorePopLayer while a pop is tweening (that yanked +N onto SCORE).
      this.scorePopPark = { x: signLeft, y: y - 46 };
    } else {
      const inset = designHudInset(readCssSafeArea(document.getElementById("game-root")));
      const { width: viewW } = hudSceneViewport(this.scene);
      const scoreRowW = captionW + HUD_SCORE_GAP + valueW;
      const { scoreLeft, clockRight, rowY } = doorCornerReadoutAnchors(
        inset,
        viewW,
        this.readoutCorner.top,
        scoreRowW,
        this.clockText.width,
      );
      this.scoreCaption.setOrigin(0, 0.5).setPosition(scoreLeft, rowY);
      this.scoreText.setOrigin(0, 0.5).setPosition(scoreLeft + captionW + HUD_SCORE_GAP, rowY);
      this.clockText.setOrigin(1, 0.5).setPosition(clockRight, rowY);
      this.scorePopPark = { x: scoreLeft + scoreRowW / 2, y: rowY - 46 };
    }
    this.syncShopReadoutMirror();
  }

  /** Force paintReadoutChrome to re-apply visibility when porch mode toggles. */
  resetReadoutChromeCache(): void {
    this.lastReadoutsHidden = null;
    this.lastShopReadoutsLayer = null;
  }

  /** Counter SCORE/clock live in ShopScene so speech (depth 10) paints above them. */
  private shopReadoutsLayerActive(atDoor: boolean, hide: boolean): boolean {
    return this.readoutsInShop && !atDoor && !hide;
  }

  private ensureShopReadouts(): void {
    if (this.shopScoreText) return;
    const shop = this.scene.scene.get("shop") as Phaser.Scene | undefined;
    if (!shop?.sys.isActive()) return;
    const depth = SHOP_COUNTER_READOUT_DEPTH;
    this.shopScoreText = addUiText(shop, 0, 0, "", {
      size: typeRolePx("hudTitle"),
      typeRole: "hudTitle",
      color: Color.creamHex,
      fontStyle: "700",
      align: "right",
      ...readoutOutline(HUD_SCORE_PX),
    })
      .setOrigin(1, 0.5)
      .setDepth(depth)
      .setVisible(false);
    this.shopScoreCaption = addUiText(shop, 0, 0, "SCORE", {
      size: typeRolePx("hudTitle"),
      typeRole: "hudTitle",
      color: Color.creamHex,
      fontStyle: "700",
      align: "right",
      letterSpacing: 2,
      ...readoutOutline(HUD_SCORE_PX),
    })
      .setOrigin(1, 0.5)
      .setDepth(depth)
      .setVisible(false);
    this.shopClockText = addUiText(shop, 0, 0, "", {
      size: typeClockPx(),
      color: Color.creamHex,
      fontStyle: "700",
      ...readoutOutline(HUD_READOUT_PX),
    })
      .setOrigin(0, 0.5)
      .setDepth(depth)
      .setVisible(false);
  }

  /** World-space counter row — SF1 tracks COUNTER_SIGN under shop cam zoom. */
  private placeShopCounterReadouts(): void {
    if (!this.shopScoreText || !this.shopScoreCaption || !this.shopClockText) return;
    const leftX = COUNTER_SIGN.x - COUNTER_SIGN.w / 2 - HUD_SIGN_GAP;
    const rightX = COUNTER_SIGN.x + COUNTER_SIGN.w / 2 + HUD_SIGN_GAP;
    const y = COUNTER_SIGN.y;
    const valueW = this.shopScoreText.width;
    const captionW = this.shopScoreCaption.width;
    let gap = HUD_SCORE_GAP;
    const signInnerLeft = COUNTER_SIGN.x - COUNTER_SIGN.w / 2;
    while (gap > 4 && leftX - valueW - gap - captionW < signInnerLeft - 8) {
      gap -= 2;
    }
    this.shopScoreText.setOrigin(1, 0.5).setPosition(leftX, y);
    this.shopScoreCaption.setOrigin(1, 0.5).setPosition(leftX - valueW - gap, y);
    this.shopClockText.setOrigin(0, 0.5).setPosition(rightX, y);
  }

  private syncShopReadoutMirror(): void {
    if (!this.readoutsInShop || this.readoutsAtDoor) return;
    this.ensureShopReadouts();
    if (!this.shopScoreText || !this.shopScoreCaption || !this.shopClockText) return;
    this.shopScoreText.setText(this.scoreText.text);
    this.shopScoreCaption.setText(this.scoreCaption.text);
    this.shopClockText.setText(this.clockText.text);
    this.placeShopCounterReadouts();
  }

  matchCaptionToValue(): void {
    const px = inkFontSizePx(this.scoreText);
    if (px === this.captionPx) return;
    this.captionPx = px;
    const outline = readoutOutline(px);
    inkSetStroke(this.scoreCaption, outline.stroke, outline.strokeThickness);
    retypeSize(this.scoreCaption, px);
    if (this.shopScoreCaption) {
      inkSetStroke(this.shopScoreCaption, outline.stroke, outline.strokeThickness);
      retypeSize(this.shopScoreCaption, px);
    }
  }

  paintReadoutChrome(atDoor: boolean, showId: boolean, chrome: HudReadoutsChrome): void {
    // Door/ID: SCORE top-left and clock top-right for the whole porch visit.
    const hide = !atDoor && showId;
    const shopLayer = this.shopReadoutsLayerActive(atDoor, hide);
    const readoutDepth = atDoor ? HUD_DOOR_READOUT_DEPTH : HUD_READOUT_DEPTH;
    this.scoreText.setDepth(readoutDepth);
    this.scoreCaption.setDepth(readoutDepth);
    this.clockText.setDepth(readoutDepth);
    if (shopLayer) {
      this.ensureShopReadouts();
      this.syncShopReadoutMirror();
      this.shopScoreText?.setVisible(true);
      this.shopScoreCaption?.setVisible(true);
      this.shopClockText?.setVisible(true);
      this.scoreText.setVisible(false);
      this.scoreCaption.setVisible(false);
      this.clockText.setVisible(false);
    }
    const visibilityChanged = hide !== this.lastReadoutsHidden || shopLayer !== this.lastShopReadoutsLayer;
    if (!visibilityChanged) return;
    this.lastReadoutsHidden = hide;
    this.lastShopReadoutsLayer = shopLayer;
    const showHudRow = !hide && !shopLayer;
    if (!shopLayer) {
      this.scoreText.setVisible(showHudRow);
      this.scoreCaption.setVisible(showHudRow);
      this.clockText.setVisible(showHudRow);
      this.shopScoreText?.setVisible(false);
      this.shopScoreCaption?.setVisible(false);
      this.shopClockText?.setVisible(false);
    }
    chrome.cog.setVisible(!hide);
    this.scorePopLayer.setVisible(!hide);
    if (hide) {
      for (const label of this.scorePopPool) chrome.releaseScorePop(label);
    }
  }

  paintDoorTitle(snap: SimSnapshot, atDoor: boolean, drop: SimSnapshot["dropoff"]): void {
    if (!atDoor || !drop.houseId) {
      if (this.lastDoorTitle !== "") {
        this.lastDoorTitle = "";
        this.doorTitleText.setVisible(false);
      }
      return;
    }
    const destOrder = snap.orders.find((o) => o.destinationId === drop.houseId && o.status === "onRun");
    const sla = destOrder ? formatSlaClock(destOrder.slaRemainingMs) : "";
    const runNote = (snap.run?.orderIds.length ?? 0) > 1 ? `  ·  ${snap.run!.orderIds.length} bags in the car` : "";
    const title = `${drop.customerName ?? "Customer"}  ·  ${houseTitle(drop.houseId)}${sla ? `  ·  ${sla}` : ""}${runNote}`;
    const show = title.trim().length > 0;
    this.doorTitleText.setVisible(show);
    if (!show) return;
    if (title !== this.lastDoorTitle) this.lastDoorTitle = title;
    if (this.doorTitleText.text !== title) setSignCopy(this.doorTitleText, title);
    setSignAccent(this.doorTitleText, Color.danger);
    this.doorTitleText.setDepth(HUD_DOOR_READOUT_DEPTH);
    syncSignPlaque(this.doorTitleText);
  }

  paintCover(
    snap: SimSnapshot,
    atDoor: boolean,
    settingsOpen: boolean,
    resultsVisible: boolean,
  ): void {
    const cover = snap.shopCover;
    const show =
      cover.active &&
      snap.playerRole === "keyLead" &&
      !atDoor &&
      !settingsOpen &&
      !resultsVisible &&
      !snap.dropoff.idCard;
    this.coverText.setVisible(show);
    if (!show) return;
    const tally = [
      cover.served ? `${cover.served} served` : null,
      cover.waiting ? `${cover.waiting} waiting` : null,
      cover.packed ? `${cover.packed} bagged` : null,
      cover.lost ? `${cover.lost} lost` : null,
    ]
      .filter(Boolean)
      .join("  ·  ");
    const line = `COUNTER  ·  ${cover.line}${tally ? `  ·  ${tally}` : ""}`;
    const maxW = this.coverMaxWidth();
    const clipped = this.clipCoverLine(line, maxW);
    if (this.coverText.text !== clipped) {
      setSignCopy(this.coverText, clipped);
    }
    syncSignPlaque(this.coverText);
  }

  coverMaxWidth(): number {
    const { left } = this.readoutCorner;
    const columnCap = Math.floor(GAME_WIDTH * 0.26);
    const scoreCap = this.scoreText.x + this.scoreText.width - left - 12;
    return Math.max(96, Math.min(columnCap, scoreCap, 280));
  }

  clipCoverLine(line: string, maxW: number): string {
    if (line.length <= 8) return line;
    let clipped = line;
    this.coverText.setText(clipped);
    while (clipped.length > 8 && this.coverText.width > maxW) {
      clipped = `${clipped.slice(0, clipped.length - 2).trimEnd()}…`;
      this.coverText.setText(clipped);
    }
    return clipped;
  }

  warmScorePopPool(): void {
    for (let i = 0; i < SCORE_POP_POOL; i++) {
      const label = addSignText(this.scene, 0, 0, "", {
        size: typeRolePx("hudBody"),
        typeRole: "hudBody",
        fontStyle: "700",
        maxWidth: typeRoleBox(160, "hudBody"),
        maxHeight: typeRoleBox(40, "hudBody"),
      })
        .setOrigin(0, 0.5)
        .setVisible(false)
        .setAlpha(0);
      this.scorePopPool.push(label);
      this.scorePopFree.push(label);
      this.scorePopLayer.add(signContainer(label));
    }
  }

  acquireScorePop(delta: number, besideActor = false): UiInk {
    let label = this.scorePopFree.pop();
    if (!label) {
      label = this.scorePopPool[0]!;
      this.scene.tweens.killTweensOf(signContainer(label));
      const idx = this.scorePopFree.indexOf(label);
      if (idx >= 0) this.scorePopFree.splice(idx, 1);
    }
    const positive = delta >= 0;
    const host = signContainer(label);
    label
      .setOrigin(besideActor ? 0 : this.readoutsInShop ? 1 : 0, 0.5)
      .setVisible(true)
      .setAlpha(1);
    host.setY(0).setAlpha(1).setVisible(true);
    label.setText(positive ? `+${delta}` : String(delta));
    setSignAccent(label, positive ? Color.leafBright : Color.danger);
    return label;
  }

  releaseScorePop(label: UiInk): void {
    const host = signContainer(label);
    this.scene.tweens.killTweensOf(host);
    host.setVisible(false).setAlpha(0).setPosition(0, 0);
    label.setVisible(false).setAlpha(0).setText("");
    if (!this.scorePopFree.includes(label)) this.scorePopFree.push(label);
  }

  /**
   * SCORE, clock, and counter KINDLING strip — shop speech resolves in the same chip
   * frame before HudScene, so ShopScene seeds these obstacles first.
   */
  registerShopHudObstacles(placer: ChipPlacer): void {
    if (!this.readoutsInShop || !this.scoreText.visible) return;
    const scorePriority = chipPriority("scoreClock");
    placer.register("scoreCaption", textInkAabb(this.scoreCaption), scorePriority);
    placer.register("scoreValue", textInkAabb(this.scoreText), scorePriority);
    placer.register("clock", textInkAabb(this.clockText), scorePriority);
    const shop = this.scene.scene.get("shop") as Phaser.Scene | undefined;
    if (!shop?.sys.isActive()) return;
    const cam = shop.cameras.main;
    const cs = COUNTER_SIGN;
    const left = cs.x - cs.w / 2;
    const right = cs.x + cs.w / 2;
    const top = cs.y - cs.h / 2;
    const bottom = cs.y + cs.h / 2;
    const corners = [
      worldToScreen(cam, left, top),
      worldToScreen(cam, right, top),
      worldToScreen(cam, left, bottom),
      worldToScreen(cam, right, bottom),
    ];
    placer.register(
      "counterSign",
      {
        left: Math.min(...corners.map((p) => p.x)),
        top: Math.min(...corners.map((p) => p.y)),
        right: Math.max(...corners.map((p) => p.x)),
        bottom: Math.max(...corners.map((p) => p.y)),
      },
      chipPriority("scoreClock"),
    );
  }

  /** Register score row and resolve cover / door-title plaques through the frame placer. */
  resolvePlaqueSlots(placer: ChipPlacer, atDoor: boolean): void {
    if (this.scoreText.visible) {
      if (this.readoutsInShop && !atDoor) {
        placer.register(
          "scoreClock",
          unionAabb([textInkAabb(this.scoreCaption), textInkAabb(this.scoreText), textInkAabb(this.clockText)]),
          chipPriority("scoreClock"),
        );
      } else {
        placer.register(
          "scoreClock",
          unionAabb([textInkAabb(this.scoreCaption), textInkAabb(this.scoreText)]),
          chipPriority("scoreClock"),
        );
        if (this.clockText.visible) {
          placer.register("scoreClock", textInkAabb(this.clockText), chipPriority("scoreClock"));
        }
      }
    }
    const coverY = this.readoutCorner.top + 40;
    if (this.coverText.visible && String(this.coverText.text).trim()) {
      const center = plaqueCenterFromTopLeft(this.coverText, this.readoutCorner.left, coverY);
      placeChip(placer, "cover", this.coverText, center.x, center.y, chipPriority("cover"));
    }
    if (atDoor && this.doorTitleText.visible && String(this.doorTitleText.text).trim()) {
      syncSignPlaque(this.doorTitleText);
      const plaque = signPlaqueExtents(this.doorTitleText);
      const centerY = this.readoutCorner.top;
      let centerX = placer.viewW / 2;
      const halfW = plaque.panelW / 2;
      if (this.scoreText.visible) {
        const scoreRight = Math.max(textInkAabb(this.scoreCaption).right, textInkAabb(this.scoreText).right);
        if (centerX - halfW < scoreRight + CHIP_GAP) {
          centerX = scoreRight + CHIP_GAP + halfW;
        }
      }
      if (this.clockText.visible) {
        const clockLeft = textInkAabb(this.clockText).left;
        if (centerX + halfW > clockLeft - CHIP_GAP) {
          centerX = clockLeft - CHIP_GAP - halfW;
        }
      }
      centerX = Phaser.Math.Clamp(centerX, placer.safe.left + halfW, placer.safe.right - halfW);
      setSignPlaqueCenter(this.doorTitleText, centerX, centerY);
    }
  }

  spawnScorePop(delta: number, screen?: { x: number; y: number }): void {
    const label = this.acquireScorePop(delta, !!screen);
    if (!screen) this.placeReadouts();
    const origin = screen ?? this.scorePopPark;
    this.scene.tweens.add({
      targets: this.scoreText,
      scale: { from: 1.18, to: 1 },
      duration: SCORE_POP_SCALE_MS,
      ease: "Back.easeOut",
    });
    // Host sits in scorePopLayer at (0,0); absolute screen coords so placeReadouts cannot yank it.
    const popHost = signContainer(label);
    popHost.setPosition(origin.x, origin.y);
    this.scene.tweens.add({
      targets: popHost,
      y: { from: origin.y, to: origin.y - 56 },
      alpha: { from: 1, to: 0 },
      duration: SCORE_POP_RISE_MS,
      ease: "Cubic.easeOut",
      onComplete: () => this.releaseScorePop(label),
    });
  }
}
