import Phaser from "phaser";
import { playCameraClick, playUiSfx } from "../audio/sfx";
import { syncMusicToClock } from "../audio/music";
import { applyPortraitTexture } from "../art/peopleAtlas";
import { clampInput } from "../input/controls";
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  HANDOFF_RADIUS,
  NPC_INTERACT_COOLDOWN_MS,
  SCORE_DELIVERY_LATE,
  SCORE_DELIVERY_ON_TIME,
  SCORE_FAIL,
  SCORE_INSTORE,
  SCORE_PICKUP,
} from "../sim/constants";
import { getSim, startSession } from "../session";
import { setPwaIdle } from "../pwaUpdate";
import type { ScorePopAnchor, SimSnapshot } from "../sim/gameSim";
import type { ShiftResults } from "../sim/shiftResults";
import { tutorialHints, type TutorialHint } from "../sim/tutorialHints";
import { skyAt, skyVisualDirtyKey } from "../sim/dayNight";
import { addHudButton, addPanel } from "../ui/chrome";
import { formatSlaClock, isSlaUrgent, RESULTS_NEW_DAY, RESULTS_TITLE } from "../ui/copy";
import { brand, headBackToShopHint } from "../ui/brand";
import { CITY, houseTitle, lotCenter } from "../maps/cityT0";
import type { UiInk } from "../ui/typeInk";
import {
  addSignText,
  setSignAccent,
  setSignCopy,
  setSignPlaqueCenter,
  setSignPosition,
  signContainer,
  signPlaqueExtents,
  syncSignPlaque,
} from "../ui/signText";
import { addUiText } from "../ui/text";
import { enableItemHit } from "../input/hit";
import { ackTap, releaseTapAck } from "../input/tapAck";
import { advanceSimClock } from "../sim/kindlingClock";
import { onRenderBudgetChange, syncSceneRenderCamera, tickRenderBudget } from "../ui/renderBudget";
import { updateFeelMeter } from "../ui/feelMeter";
import { notePerfRawDelta } from "../ui/perfProbe";
import { Color, MENU_TYPE_FIT, Type } from "../ui/theme";
import { typeRoleBox, typeRolePx } from "../ui/typeScale";
import { worldToScreen } from "../ui/worldProject";
import {
  DRIVE_PIN_MAX_H,
  DRIVE_PIN_INK_PAD_H,
  DRIVE_PIN_LINE_SPACING,
  DRIVE_PIN_PLAQUE_PAD,
  DRIVE_PIN_MAX_W,
  DRIVE_SHOP_CAP_MAX_W,
  DRIVE_VAN_MAX_W,
  DRIVE_VAN_TEX_H,
} from "./driveConstants";
import { loadWorldScenes } from "./worldScenes";
import {
  designHudInset,
  hudSceneViewport,
  HUD_TOUCH_MIN_DESIGN,
  readCssSafeArea,
  VIEWFIT_EVENT,
  type SafeInset,
} from "../ui/viewFit";
import { HudReadouts } from "../ui/hud/readouts";
import { HudSettings } from "../ui/hud/settings";
import { HudPhone } from "../ui/hud/phone";
import { HudIdCard } from "../ui/hud/idCard";
import { ID_DENY_INK, ID_OK_INK, ID_PHOTO_H, ID_PHOTO_W, PHONE_H } from "../ui/hud/constants";
import type { ChipPlacer } from "../ui/hud/chipCollision";
import { beginChipFrame, placeChip } from "../ui/hud/placeChips";
import { CHIP_GAP, chipPriority } from "../ui/hud/slots";

/**
 * Cap one sim step so a long background pause does not jump the shift clock.
 * Smoothed delta already softens hitch frames; this only bounds tab-away gaps.
 */
const MAX_SIM_STEP_MS = 1_000;
/** Keep sign plaques fully inside the HUD camera — matches Door prompt dodge margin. */
const SCREEN_CHIP_MARGIN = 12;

const driveChipSignOpts = {
  padVariant: "compact" as const,
} as const;

const RESULTS_W = 740;
const RESULTS_H = 640;

export class HudScene extends Phaser.Scene {
  private readouts = new HudReadouts(this);
  private hudSettings!: HudSettings;
  private phoneWidget = new HudPhone(this);
  private idCard = new HudIdCard(this);

  private padRing!: Phaser.GameObjects.Graphics;
  private padKnob!: Phaser.GameObjects.Arc;
  private padLabel!: UiInk;
  private flash!: Phaser.GameObjects.Rectangle;
  private toastText!: UiInk;
  private drivePinLabel!: UiInk;
  private driveVanBanner!: UiInk;
  private driveShopCaption!: UiInk;
  private driveShopCenter = { x: 0, y: 0 };
  private lastPinWho = "";
  private lastVanToast = "";
  private lastShopCaptionKey = "";
  private sawPhoto = false;
  private idWasShowing = false;
  private idCardArmedAt = 0;
  private padCenter = { x: 196, y: GAME_HEIGHT - 220 };
  private pointerId: number | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private resultsDim!: Phaser.GameObjects.Rectangle;
  private resultsPanel!: Phaser.GameObjects.Container;
  private resultsTitle!: UiInk;
  private resultsScore!: UiInk;
  private resultsBreakdown!: UiInk;
  private resultsVerdict!: UiInk;
  private resultsClock!: UiInk;
  private resultsVisible = false;
  private lastScoreFlashId = 0;
  private lastSfxId = 0;
  /** Last shiftEnded passed to setPwaIdle — edge only, not every frame. */
  private pwaIdleShiftEnded = false;
  /** Door/HUD stacking — bringToTop only when this changes (not every frame). */
  private doorTopMode: "doorHud" | "hud" = "hud";
  private lastClockLabel = "";
  private lastToast = "";
  private lastPadLabel = "";
  private lastPadFlash: boolean | null = null;
  /** Tutorial hint cache — rebuild when ticket/role/phase/hand change, not every frame. */
  private lastTutorialHintKey = "";
  private cachedTutorialHint: TutorialHint | null = null;
  private lastShowPhone: boolean | null = null;
  private lastShowId: boolean | null = null;
  private lastShopSceneVisible = true;
  private lastIdLive: boolean | null = null;
  private lastDriveSceneKey = "";
  private lastDoorSceneKey = "";
  private lastIdTextKey = "";
  private lastMusicSkyKey = "";

  constructor() {
    super("hud");
  }

  create(): void {
    this.input.setTopOnly(false);
    syncSceneRenderCamera(this);

    this.readouts.create();
    this.phoneWidget.create();
    this.idCard.create();
    this.hudSettings = new HudSettings(this, {
      onEndShift: () => this.paintHud(getSim().snapshot()),
      onResetDay: () => {
        this.lastMusicSkyKey = "";
      },
      onRepaint: () => this.paintHud(getSim().snapshot()),
      hideResults: () => this.hideResults(),
      ensureShopVisible: () => this.ensureShopVisible(),
    });
    this.hudSettings.create();

    this.toastText = addSignText(this, GAME_WIDTH / 2, GAME_HEIGHT - 36, "", {
      size: typeRolePx("hudBody"),
      typeRole: "hudBody",
      align: "center",
      fontStyle: "600",
      maxWidth: typeRoleBox(900, "hudBody"),
      maxHeight: typeRoleBox(80, "hudBody"),
    })
      .setOrigin(0.5, 1)
      .setDepth(20);

    this.driveShopCenter = lotCenter(CITY.shopLot.origin, CITY.shopLot.w, CITY.shopLot.h);
    this.drivePinLabel = addSignText(this, 0, 0, "", {
      size: typeRolePx("hudBody"),
      typeRole: "hudBody",
      align: "center",
      fontStyle: "700",
      padX: DRIVE_PIN_PLAQUE_PAD,
      padY: DRIVE_PIN_PLAQUE_PAD,
      lineSpacing: DRIVE_PIN_LINE_SPACING,
      inkPad: {
        left: DRIVE_PIN_INK_PAD_H,
        top: 0,
        right: DRIVE_PIN_INK_PAD_H,
        bottom: DRIVE_PIN_LINE_SPACING,
      },
      noWrap: true,
      maxWidth: typeRoleBox(DRIVE_PIN_MAX_W, "hudBody"),
      maxHeight: typeRoleBox(DRIVE_PIN_MAX_H, "hudBody"),
    })
      .setOrigin(0.5, 1)
      .setDepth(21)
      .setVisible(false);
    this.driveVanBanner = addSignText(this, 0, 0, "", {
      size: typeRolePx("hudBody"),
      typeRole: "hudBody",
      align: "center",
      fontStyle: "600",
      noWrap: true,
      ...driveChipSignOpts,
      maxWidth: typeRoleBox(DRIVE_VAN_MAX_W, "hudBody"),
    })
      .setOrigin(0.5, 1)
      .setDepth(21)
      .setVisible(false);
    this.driveShopCaption = addSignText(this, 0, 0, "", {
      size: typeRolePx("hudBody"),
      typeRole: "hudBody",
      fontStyle: "700",
      noWrap: true,
      ...driveChipSignOpts,
      maxWidth: typeRoleBox(DRIVE_SHOP_CAP_MAX_W, "hudBody"),
    })
      .setOrigin(0.5, 0)
      .setDepth(21)
      .setVisible(false);

    this.flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0).setDepth(24);

    this.padRing = this.add.graphics().setDepth(19);
    this.drawPad();
    this.padKnob = this.add.circle(this.padCenter.x, this.padCenter.y, 40, Color.cream, 0.92).setDepth(20);
    this.padLabel = addSignText(this, this.padCenter.x, this.padCenter.y - 128, "Heading to stop…", {
      size: typeRolePx("hudBody"),
      typeRole: "hudBody",
      fontStyle: "600",
      maxWidth: typeRoleBox(300, "hudBody"),
      maxHeight: typeRoleBox(50, "hudBody"),
    })
      .setOrigin(0.5, 1)
      .setDepth(20);
    this.padRing.setVisible(false);
    this.padKnob.setVisible(false);
    this.padLabel.setVisible(false);

    const kb = this.input.keyboard;
    this.keys = kb
      ? (kb.addKeys("W,A,S,D,E,UP,DOWN,LEFT,RIGHT,SPACE") as Record<string, Phaser.Input.Keyboard.Key>)
      : {};
    const onConfirmDown = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      getSim().pressDropoffConfirm();
    };
    const onConfirmUp = (): void => {
      getSim().releaseDropoffConfirm();
    };
    kb?.on("keydown-E", onConfirmDown);
    kb?.on("keydown-SPACE", onConfirmDown);
    kb?.on("keyup-E", onConfirmUp);
    kb?.on("keyup-SPACE", onConfirmUp);

    this.input.addPointer(2);
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.onPointerUp(p));

    this.makeResults();
    this.layoutHud();
    const relayout = (): void => {
      syncSceneRenderCamera(this);
      this.layoutHud();
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, relayout);
    this.game.events.on(VIEWFIT_EVENT, relayout);
    const offBudget = onRenderBudgetChange(relayout);
    this.events.on(Phaser.Scenes.Events.PAUSE, () => {
      this.toastText.setVisible(false);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWFIT_EVENT, relayout);
      offBudget();
    });

    this.paintHud(getSim().snapshot());
  }

  update(_time: number, delta: number): void {
    const sim = getSim();
    if (!sim.isAutoDriving()) {
      const { dx, dy } = this.readInput();
      sim.setPlayerInput(dx, dy);
    } else {
      sim.setPlayerInput(0, 0);
    }
    const rawDelta = this.game.loop.rawDelta;
    const frameMs = delta;
    advanceSimClock({
      frameMs,
      tick: (dt) => sim.tick(Math.min(Math.max(0, dt), MAX_SIM_STEP_MS)),
      snapshot: () => sim.snapshot(),
    });
    const snap = sim.snapshot();
    tickRenderBudget(this.game.loop.actualFps, performance.now());
    notePerfRawDelta(rawDelta);
    updateFeelMeter(this.game, { rawDeltaMs: rawDelta, sceneDeltaMs: delta });
    if (snap.shiftEnded !== this.pwaIdleShiftEnded) {
      this.pwaIdleShiftEnded = snap.shiftEnded;
      setPwaIdle(snap.shiftEnded);
    }
    this.paintHud(snap);
  }

  private layoutHud(): void {
    const inset = designHudInset(readCssSafeArea(document.getElementById("game-root")));
    const { width: viewW, height: viewH } = hudSceneViewport(this);
    this.readouts.layoutReadoutColumn(inset);
    this.readouts.placeReadouts();
    this.hudSettings.layout(inset);
    const cogLeft = this.hudSettings.cog.x - this.hudSettings.cog.displayWidth;
    const cogTop = this.hudSettings.cog.y - this.hudSettings.cog.displayHeight;
    this.phoneWidget.layout(inset, cogLeft, cogTop, viewW, viewH);
    this.idCard.layout(inset, viewW, viewH);
    this.placeInstructionChip(this.toastText, inset, viewW, viewH);
    this.padCenter = { x: 196 + inset.left, y: viewH - 220 - inset.bottom };
    this.lastPadFlash = null;
    this.drawPad();
    this.padKnob.setPosition(this.padCenter.x, this.padCenter.y);
    this.placeInstructionChip(this.padLabel, inset, viewW, viewH);
  }

  /** Instruction / toast plaques pin top-center, clear of the safe inset. */
  private placeInstructionChip(
    chip: UiInk,
    inset: SafeInset,
    viewW: number,
    viewH: number,
  ): void {
    syncSignPlaque(chip);
    const plaque = signPlaqueExtents(chip);
    const centerY = inset.top + SCREEN_CHIP_MARGIN + plaque.panelH / 2;
    const clamped = clampSignPlaqueCenter(chip, viewW / 2, centerY, viewW, viewH, inset);
    setSignPlaqueCenter(chip, clamped.x, clamped.y);
  }

  private paintHud(snap: SimSnapshot): void {
    const scoreLabel = String(snap.score);
    const scoreResized = scoreLabel !== this.readouts.scoreText.text;
    if (scoreResized) this.readouts.scoreText.setText(scoreLabel);
    const atDoor = snap.dropoff.phase === "atDoor";
    if (snap.clockLabel !== this.lastClockLabel) {
      this.lastClockLabel = snap.clockLabel;
      this.readouts.clockText.setText(snap.clockLabel);
      if (atDoor) this.readouts.placeReadouts();
    }
    const inShop = snap.playerRole !== "driver";
    const modeChanged = inShop !== this.readouts.readoutsInShop;
    this.readouts.readoutsInShop = inShop;
    const doorModeChanged = atDoor !== this.readouts.readoutsAtDoor;
    this.readouts.readoutsAtDoor = atDoor;
    if (doorModeChanged) this.readouts.resetReadoutChromeCache();
    if (atDoor || scoreResized || modeChanged) this.readouts.placeReadouts();
    this.consumeScoreFlash(snap);
    this.consumeSfx(snap);
    this.syncResults(snap);
    if (snap.shiftEnded) {
      this.toastText.setVisible(false);
      this.readouts.coverText.setVisible(false);
      this.readouts.doorTitleText.setVisible(false);
      this.phoneWidget.phone.setVisible(false);
      this.phoneWidget.phoneHit.disableInteractive();
      this.idCard.idDim.setVisible(false);
      this.idCard.idPanel.setVisible(false);
      this.padRing.setVisible(false);
      this.padKnob.setVisible(false);
      this.padLabel.setVisible(false);
      this.syncDoorScene(snap);
      this.syncMusicIfNeeded(snap.gameMs);
      return;
    }
    const next = this.tutorialFlashHint(snap);
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(snap.gameMs / 160));
    const flashNext = this.hudSettings.isOpen || this.resultsVisible ? null : next;

    const drop = snap.dropoff;
    const showPhone = snap.playerRole === "driver" && (drop.phase === "atCurb" || drop.phase === "calling");
    const flashPhone = flashNext?.kind === "phone";

    this.phoneWidget.phone.setVisible(showPhone);
    if (showPhone !== this.lastShowPhone) {
      this.lastShowPhone = showPhone;
      if (showPhone) {
        if (!this.phoneWidget.phoneHit.input) this.phoneWidget.phoneHit.setInteractive({ useHandCursor: true });
        else this.phoneWidget.phoneHit.input.enabled = true;
      } else {
        this.phoneWidget.phoneHit.disableInteractive();
      }
    }
    const callName = drop.customerName ?? "customer";
    const phoneLine =
      drop.phase === "calling" ? `Calling…\n${callName}` : `Tap to call\n${callName}`;
    if (showPhone) {
      this.phoneWidget.phone.setAlpha(1);
      this.phoneWidget.phoneBody.setAlpha(drop.phase === "calling" ? 0.92 : 1);
      const cue = flashPhone && drop.phase !== "calling";
      const accentKey = cue ? "lime" : drop.phase === "calling" ? "leaf" : "none";
      this.phoneWidget.updateStatus(showPhone, phoneLine, accentKey, cue, drop.phase === "calling", snap);
    } else {
      this.phoneWidget.updateStatus(false, phoneLine, "", false, false, snap);
    }

    const showId = !!drop.idCard && drop.idAsked;
    if (showId && !this.idWasShowing) {
      this.idCardArmedAt = snap.gameMs + NPC_INTERACT_COOLDOWN_MS;
    }
    if (!showId && this.idWasShowing) {
      getSim().releaseDropoffConfirm();
    }
    this.idWasShowing = showId;
    const idLive = showId && snap.gameMs >= this.idCardArmedAt;
    const flashId = flashNext?.kind === "idCard";
    this.idCard.idDim.setVisible(showId);
    if (showId !== this.lastShowId) {
      this.lastShowId = showId;
      if (showId) {
        if (!this.idCard.idDim.input) this.idCard.idDim.setInteractive({ useHandCursor: false });
        else this.idCard.idDim.input.enabled = true;
      } else {
        this.idCard.idDim.disableInteractive();
      }
    }
    this.idCard.idPanel.setVisible(showId);
    this.idCard.idPanel.setAlpha(1);
    if (idLive !== this.lastIdLive) {
      this.lastIdLive = idLive;
      if (idLive) {
        if (!this.idCard.idBg.input) enableItemHit(this.idCard.idBg);
        else this.idCard.idBg.input.enabled = true;
      } else {
        this.idCard.idBg.disableInteractive();
      }
    }
    this.idCard.idFlashRing.setVisible(idLive && flashId);
    if (idLive && flashId) {
      this.idCard.idFlashRing.setStrokeStyle(6 + Math.round(4 * pulse), Color.lime, 0.55 + 0.45 * pulse);
      this.idCard.idFlashRing.setAlpha(1);
    }
    this.idCard.idBg.setAlpha(1);
    this.idCard.idTitle.setAlpha(1);
    this.idCard.idName.setAlpha(1);
    this.idCard.idDob.setAlpha(1);
    this.idCard.idHint.setAlpha(1);
    if (drop.idCard) {
      const card = drop.idCard;
      const idTextKey = `${card.name}|${card.dob}|${card.ageOk ? 1 : 0}|${card.idNumber}|${card.expires}`;
      if (idTextKey !== this.lastIdTextKey) {
        this.lastIdTextKey = idTextKey;
        this.idCard.idName.setText(card.name.toUpperCase());
        this.idCard.idDob.setText(`${card.dob}   ·   ${card.ageOk ? "19+" : "UNDER 19"}`);
        this.idCard.idNumber.setText(card.idNumber);
        this.idCard.idExpiry.setText(card.expires);
        this.idCard.idHint.setText(card.ageOk ? "Tap the card to confirm 19+" : "UNDER 19 — tap to deny and leave");
        this.idCard.idBg.setStrokeStyle(6, card.ageOk ? ID_OK_INK : ID_DENY_INK);
      }
      applyPortraitTexture(this.idCard.idPhoto, drop.customerLook ?? 0);
      this.idCard.idPhoto.setDisplaySize(ID_PHOTO_W, ID_PHOTO_H);
      this.idCard.paintIdCard(card, card.idNumber);
    } else {
      this.lastIdTextKey = "";
    }

    if (drop.photoTaken && !this.sawPhoto) {
      this.sawPhoto = true;
      playCameraClick(this.game);
      this.flash.setAlpha(0.85);
      this.tweens.add({ targets: this.flash, alpha: 0, duration: 220 });
    }
    if (!drop.photoTaken) this.sawPhoto = false;

    if ((snap.toast ?? "") !== this.lastToast) {
      this.lastToast = snap.toast ?? "";
      setSignCopy(this.toastText, snap.toast ?? "");
    }
    const driving = snap.playerRole === "driver" && !atDoor;
    const driveBanner = driving && !!snap.toast;
    const shopPlay = snap.playerRole === "keyLead";
    this.toastText.setVisible(
      !!snap.toast &&
        !shopPlay &&
        !showId &&
        snap.dropoff.phase !== "atDoor" &&
        !showPhone &&
        !driveBanner,
    );
    this.readouts.paintReadoutChrome(atDoor, showId, {
      cog: this.hudSettings.cog,
      settingsOpen: this.hudSettings.isOpen,
      resultsVisible: this.resultsVisible,
      releaseScorePop: (label) => this.readouts.releaseScorePop(label),
    });
    this.syncShopVisibility(snap);
    this.readouts.paintDoorTitle(snap, atDoor, drop);
    this.readouts.paintCover(snap, atDoor, this.hudSettings.isOpen, this.resultsVisible);
    this.paintDriveCallouts(snap, driving, flashNext);
    const showPad = false;
    this.padRing.setVisible(false);
    this.padKnob.setVisible(false);
    this.padLabel.setVisible(false);
    this.lastPadLabel = "";
    this.lastPadFlash = null;
    if (this.pointerId !== null) this.pointerId = null;
    this.syncDriveScene(snap);
    this.syncDoorScene(snap);
    if (atDoor) this.readouts.placeReadouts();
    this.resolveHudChips(snap, atDoor, showPhone, showPad, this.toastText.visible);
    this.syncMusicIfNeeded(snap.gameMs);
  }

  /**
   * Shop speech resolves in the same chip frame before HudScene runs — seed SCORE/clock
   * and counter-sign obstacles so head-hung plaques stack upward instead of onto HUD.
   */
  prepareShopChipObstacles(placer: ChipPlacer): void {
    this.readouts.placeReadouts();
    this.hudSettings.registerChipObstacle(placer);
    this.readouts.registerShopHudObstacles(placer);
  }

  /** One resolver pass after copy is set — plaques dodge higher-priority slots. */
  private resolveHudChips(
    snap: SimSnapshot,
    atDoor: boolean,
    showPhone: boolean,
    showPad: boolean,
    toastVisible: boolean,
  ): void {
    const inset = designHudInset(readCssSafeArea(document.getElementById("game-root")));
    const { width: viewW, height: viewH } = hudSceneViewport(this);
    const placer = beginChipFrame(this.game, inset, viewW, viewH);
    this.hudSettings.registerChipObstacle(placer);
    this.readouts.placeReadouts();
    this.readouts.resolvePlaqueSlots(placer, atDoor);

    if (toastVisible) {
      syncSignPlaque(this.toastText);
      const toastPlaque = signPlaqueExtents(this.toastText);
      const toastY = inset.top + SCREEN_CHIP_MARGIN + toastPlaque.panelH / 2;
      placeChip(placer, "toast", this.toastText, viewW / 2, toastY, chipPriority("toast"));
    }

    if (this.drivePinLabel.visible) {
      syncSignPlaque(this.drivePinLabel);
      const pinPlaque = signPlaqueExtents(this.drivePinLabel);
      const pinY = inset.top + SCREEN_CHIP_MARGIN + pinPlaque.panelH / 2;
      placeChip(placer, "drivePin", this.drivePinLabel, viewW / 2, pinY, chipPriority("drivePin"));
    }

    if (showPhone && this.phoneWidget.phone.visible) {
      const phoneBounds = this.phoneWidget.phone.getBounds();
      placer.register(
        "phone",
        {
          left: phoneBounds.left,
          top: phoneBounds.top,
          right: phoneBounds.right,
          bottom: phoneBounds.bottom,
        },
        chipPriority("phone"),
      );
    }
  }

  /** Shop ORDERS and strain chips must not paint through Door while the scene sleeps. */
  private syncShopVisibility(snap: SimSnapshot): void {
    const show = snap.playerRole === "keyLead";
    if (show === this.lastShopSceneVisible) return;
    this.lastShopSceneVisible = show;
    this.scene.setVisible(show, "shop");
  }

  /** Active delivery or return-to-shop pin top-center; van/shop map captions stay off the drive map. */
  private paintDriveCallouts(snap: SimSnapshot, driving: boolean, flashNext: TutorialHint | null): void {
    const stopId = driving ? snap.run?.nextStopId : null;
    const destOrder =
      stopId != null ? snap.orders.find((o) => o.destinationId === stopId && o.status === "onRun") : undefined;
    if (stopId && destOrder) {
      const clock = formatSlaClock(destOrder.slaRemainingMs);
      const who = `${houseTitle(stopId)}\n${destOrder.customerName}${clock ? ` · ${clock}` : ""}`;
      if (who !== this.lastPinWho) {
        this.lastPinWho = who;
        setSignCopy(this.drivePinLabel, who);
      }
      setSignAccent(this.drivePinLabel, isSlaUrgent(destOrder.slaRemainingMs) ? Color.danger : undefined);
      if (flashNext?.kind === "gpsPin") setSignAccent(this.drivePinLabel, Color.lime);
      syncSignPlaque(this.drivePinLabel);
      this.drivePinLabel.setVisible(true);
      signContainer(this.drivePinLabel).setVisible(true);
      const inset = designHudInset(readCssSafeArea(document.getElementById("game-root")));
      const { width: viewW, height: viewH } = hudSceneViewport(this);
      this.placeInstructionChip(this.drivePinLabel, inset, viewW, viewH);
    } else if (driving) {
      const nearShop =
        Math.hypot(snap.vehicle.x - this.driveShopCenter.x, snap.vehicle.y - this.driveShopCenter.y) <=
        HANDOFF_RADIUS;
      const who = nearShop
        ? `Tap ${brand.shopLabel}\nto return`
        : headBackToShopHint();
      if (who !== this.lastPinWho) {
        this.lastPinWho = who;
        setSignCopy(this.drivePinLabel, who);
      }
      setSignAccent(this.drivePinLabel, nearShop || flashNext?.kind === "shop" ? Color.lime : undefined);
      syncSignPlaque(this.drivePinLabel);
      this.drivePinLabel.setVisible(true);
      signContainer(this.drivePinLabel).setVisible(true);
      const inset = designHudInset(readCssSafeArea(document.getElementById("game-root")));
      const { width: viewW, height: viewH } = hudSceneViewport(this);
      this.placeInstructionChip(this.drivePinLabel, inset, viewW, viewH);
    } else {
      if (this.lastPinWho) {
        this.lastPinWho = "";
        setSignCopy(this.drivePinLabel, "");
      }
      this.drivePinLabel.setVisible(false);
      signContainer(this.drivePinLabel).setVisible(false);
    }

    if (this.lastVanToast || this.lastShopCaptionKey) {
      this.lastVanToast = "";
      this.lastShopCaptionKey = "";
      setSignCopy(this.driveVanBanner, "");
      setSignCopy(this.driveShopCaption, "");
    }
    this.driveVanBanner.setVisible(false);
    this.driveShopCaption.setVisible(false);
    signContainer(this.driveVanBanner).setVisible(false);
    signContainer(this.driveShopCaption).setVisible(false);
  }

  private tutorialFlashHint(snap: SimSnapshot): TutorialHint | null {
    const key = `${snap.selectedOrderId ?? ""}:${snap.playerRole}:${snap.dropoff.phase}:${snap.handSkuId ?? ""}:${snap.tabletTicket?.id ?? ""}`;
    if (key !== this.lastTutorialHintKey) {
      this.lastTutorialHintKey = key;
      this.cachedTutorialHint = tutorialHints(snap)[0] ?? null;
    }
    return this.cachedTutorialHint;
  }

  private syncMusicIfNeeded(gameMs: number): void {
    const key = skyVisualDirtyKey(skyAt(gameMs));
    if (key === this.lastMusicSkyKey) return;
    this.lastMusicSkyKey = key;
    syncMusicToClock(gameMs);
  }

  private syncDriveScene(snap: SimSnapshot): void {
    if (snap.playerRole !== "driver") {
      if (this.lastDriveSceneKey !== "__shop__") {
        this.lastDriveSceneKey = "__shop__";
        this.ensureShopVisible();
      }
      return;
    }
    const key = snap.dropoff.phase;
    if (key === this.lastDriveSceneKey) return;
    this.lastDriveSceneKey = key;
    if (this.scene.isActive("shop") && !this.scene.isSleeping("shop")) this.scene.sleep("shop");
    if (snap.dropoff.phase === "atDoor") return;
    void loadWorldScenes(this.game).then(() => {
      if (this.scene.isSleeping("drive")) this.scene.wake("drive");
      else if (!this.scene.isActive("drive")) this.scene.launch("drive");
    });
  }

  private makeResults(): void {
    this.resultsDim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, Color.ink, 0.62)
      .setDepth(50)
      .setInteractive()
      .setVisible(false);
    this.resultsDim.disableInteractive();
    this.resultsDim.on("pointerdown", (p: Phaser.Input.Pointer) => p.event.stopPropagation());

    const x = Math.floor((GAME_WIDTH - RESULTS_W) / 2);
    const y = Math.floor((GAME_HEIGHT - RESULTS_H) / 2);
    const bg = addPanel(this, 0, 0, RESULTS_W, RESULTS_H, {
      radius: 4,
      fill: Color.card,
      stroke: Color.woodTrim,
      depth: 51,
    });
    this.resultsTitle = addUiText(this, RESULTS_W / 2, 28, "", {
      size: Type.title,
      color: Color.inkHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: RESULTS_W - 64,
      maxHeight: 48,
    }).setOrigin(0.5, 0);
    this.resultsClock = addUiText(this, RESULTS_W / 2, 78, "", {
      size: Type.caption,
      color: Color.muteHex,
      fontStyle: "600",
      align: "center",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: RESULTS_W - 64,
      maxHeight: 28,
    }).setOrigin(0.5, 0);
    this.resultsScore = addUiText(this, RESULTS_W / 2, 118, "", {
      size: Type.display,
      color: Color.inkHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: RESULTS_W - 64,
      maxHeight: 52,
    }).setOrigin(0.5, 0);
    const scoreCap = addUiText(this, RESULTS_W / 2, 176, "SHIFT SCORE", {
      size: Type.caption,
      color: Color.muteHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: RESULTS_W - 64,
      maxHeight: 28,
    }).setOrigin(0.5, 0);
    this.resultsBreakdown = addUiText(this, RESULTS_W / 2, 220, "", {
      size: Type.body,
      color: Color.inkHex,
      fontStyle: "600",
      align: "center",
      strokeThickness: 0,
      lineSpacing: 8,
      ...MENU_TYPE_FIT,
      maxWidth: RESULTS_W - 80,
      maxHeight: 168,
    }).setOrigin(0.5, 0);
    this.resultsVerdict = addUiText(this, RESULTS_W / 2, 408, "", {
      size: Type.body,
      color: Color.inkHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: RESULTS_W - 96,
      maxHeight: 48,
    }).setOrigin(0.5, 0);

    const newDay = addHudButton(this, RESULTS_W / 2 - 12, 472, RESULTS_NEW_DAY.label, () => this.onNewDay(), {
      originX: 1,
      originY: 0,
      variant: "primary",
      minWidth: 280,
      caption: RESULTS_NEW_DAY.caption,
      depth: 52,
    });
    const titleBtn = addHudButton(this, RESULTS_W / 2 + 12, 472, RESULTS_TITLE.label, () => this.onTitle(), {
      originX: 0,
      originY: 0,
      variant: "amber",
      minWidth: 240,
      caption: RESULTS_TITLE.caption,
      depth: 52,
    });

    this.resultsPanel = this.add.container(x, y, [
      bg,
      this.resultsTitle,
      this.resultsClock,
      this.resultsScore,
      scoreCap,
      this.resultsBreakdown,
      this.resultsVerdict,
      newDay,
      titleBtn,
    ]);
    this.resultsPanel.setDepth(51).setVisible(false);
  }

  private consumeScoreFlash(snap: SimSnapshot): void {
    const flash = snap.scoreFlash;
    if (!flash || flash.id === this.lastScoreFlashId) return;
    this.lastScoreFlashId = flash.id;
    this.readouts.spawnScorePop(flash.delta, this.projectScorePop(flash.anchor));
  }

  /** Float +N beside the scoring actor — shop customer, van, or doorstep guest. */
  private projectScorePop(anchor: ScorePopAnchor): { x: number; y: number } {
    const world = this.scene.get(anchor.space) as Phaser.Scene | undefined;
    const cam = world?.sys.isActive() ? world.cameras.main : this.cameras.main;
    const pt = worldToScreen(cam, anchor.x, anchor.y);
    const offsetX = anchor.space === "shop" ? 52 : 72;
    const offsetY =
      anchor.space === "drive" ? -DRIVE_VAN_TEX_H / 2 - 8 : anchor.space === "door" ? -48 : -20;
    return { x: pt.x + offsetX, y: pt.y + offsetY };
  }

  private consumeSfx(snap: SimSnapshot): void {
    const cue = snap.sfxCue;
    if (!cue || cue.id === this.lastSfxId) return;
    this.lastSfxId = cue.id;
    playUiSfx(this.game, cue.kind);
  }

  private syncResults(snap: SimSnapshot): void {
    if (!snap.shiftEnded || !snap.shiftResults) {
      this.hideResults();
      return;
    }
    this.showResults(snap.shiftResults);
  }

  private showResults(results: ShiftResults): void {
    this.resultsVisible = true;
    this.resultsDim.setVisible(true).setInteractive();
    this.resultsPanel.setVisible(true);
    this.resultsTitle.setText(results.title);
    this.resultsClock.setText(`Clock ${results.clockLabel}`);
    this.resultsScore.setText(String(results.score));
    this.resultsBreakdown.setText(formatBreakdown(results));
    this.resultsVerdict.setText(results.verdict);
    this.scene.bringToTop();
  }

  private hideResults(): void {
    this.resultsVisible = false;
    this.resultsDim.setVisible(false).disableInteractive();
    this.resultsPanel.setVisible(false);
  }

  private onNewDay(): void {
    getSim().startNewDay();
    syncMusicToClock(0);
    this.hideResults();
    this.hudSettings.close();
    this.ensureShopVisible();
    this.paintHud(getSim().snapshot());
  }

  private onTitle(): void {
    startSession();
    this.hideResults();
    this.hudSettings.close();
    this.ensureShopVisible();
    if (this.scene.isActive("title")) this.scene.stop("title");
    this.scene.launch("title");
  }

  private ensureShopVisible(): void {
    if (this.scene.isActive("door") && !this.scene.isSleeping("door")) this.scene.sleep("door");
    if (this.scene.isActive("drive") && !this.scene.isSleeping("drive")) this.scene.sleep("drive");
    if (this.scene.isSleeping("shop")) this.scene.wake("shop");
    else if (!this.scene.isActive("shop")) this.scene.launch("shop");
  }

  private drawPad(flash = false): void {
    const { x, y } = this.padCenter;
    this.padRing.clear();
    this.padRing.fillStyle(Color.ink, 0.4);
    this.padRing.fillCircle(x, y, 108);
    this.padRing.lineStyle(flash ? 6 : 5, Color.lime, flash ? 1 : 0.85);
    this.padRing.strokeCircle(x, y, 108);
    this.padRing.lineStyle(3, flash ? Color.cream : Color.cream, flash ? 0.7 : 0.35);
    this.padRing.strokeCircle(x, y, 76);
  }

  private syncDoorScene(snap: SimSnapshot): void {
    const wantDoor = snap.playerRole === "driver" && snap.dropoff.phase === "atDoor";
    const sceneKey = `${snap.playerRole}:${snap.dropoff.phase}:${wantDoor ? 1 : 0}`;
    if (sceneKey !== this.lastDoorSceneKey) {
      this.lastDoorSceneKey = sceneKey;
      const doorUp = this.scene.isActive("door") && !this.scene.isSleeping("door");
      if (wantDoor && !doorUp) {
        this.scene.sleep("drive");
        void loadWorldScenes(this.game).then(() => {
          if (this.scene.isSleeping("door")) this.scene.wake("door");
          else if (!this.scene.isActive("door")) this.scene.launch("door");
        });
      } else if (!wantDoor && doorUp) {
        this.scene.sleep("door");
        this.idWasShowing = false;
        this.lastShowId = false;
        this.idCard.idDim.setVisible(false).disableInteractive();
        this.idCard.idPanel.setVisible(false);
        this.idCard.idBg.disableInteractive();
        getSim().releaseDropoffConfirm();
        if (snap.playerRole === "driver" && this.scene.isSleeping("drive")) {
          void loadWorldScenes(this.game).then(() => this.scene.wake("drive"));
        }
      }
    }
    // Door playfield under HUD chrome — score, status, and ID must stay visible at the porch.
    const topMode: "doorHud" | "hud" = wantDoor ? "doorHud" : "hud";
    if (topMode === this.doorTopMode) return;
    this.doorTopMode = topMode;
    if (topMode === "doorHud") {
      this.scene.bringToTop("door");
      this.scene.bringToTop();
    } else {
      this.scene.bringToTop();
    }
  }

  private readInput(): { dx: number; dy: number } {
    let dx = 0;
    let dy = 0;
    if (this.keys.A?.isDown || this.keys.LEFT?.isDown) dx -= 1;
    if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) dx += 1;
    if (this.keys.W?.isDown || this.keys.UP?.isDown) dy -= 1;
    if (this.keys.S?.isDown || this.keys.DOWN?.isDown) dy += 1;

    if (this.pointerId !== null) {
      const pointers = [this.input.pointer1, this.input.pointer2, this.input.activePointer].filter(
        (pt): pt is Phaser.Input.Pointer => !!pt,
      );
      const p = pointers.find((pt) => pt.id === this.pointerId) ?? this.input.activePointer;
      dx = Phaser.Math.Clamp((p.x - this.padCenter.x) / 88, -1, 1);
      dy = Phaser.Math.Clamp((p.y - this.padCenter.y) / 88, -1, 1);
      this.padKnob.setPosition(this.padCenter.x + dx * 48, this.padCenter.y + dy * 48);
    } else {
      this.padKnob.setPosition(this.padCenter.x, this.padCenter.y);
    }
    return clampInput(dx, dy);
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (!this.padRing.visible) return;
    const d = Phaser.Math.Distance.Between(p.x, p.y, this.padCenter.x, this.padCenter.y);
    if (d <= HUD_TOUCH_MIN_DESIGN) {
      this.pointerId = p.id;
      ackTap(this.padKnob);
      playUiSfx(this.game, "ticket");
    }
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (this.pointerId === p.id) {
      this.pointerId = null;
      releaseTapAck(this.padKnob, 1, 1);
    }
  }
}

/** Nudge a preferred plaque center so the panel stays inside the HUD viewport. */
function clampSignPlaqueCenter(
  text: UiInk,
  centerX: number,
  centerY: number,
  viewW: number,
  viewH: number,
  inset: SafeInset,
  margin = SCREEN_CHIP_MARGIN,
): { x: number; y: number } {
  syncSignPlaque(text);
  const plaque = signPlaqueExtents(text);
  const halfW = plaque.panelW / 2;
  const halfH = plaque.panelH / 2;
  return {
    x: Phaser.Math.Clamp(centerX, inset.left + margin + halfW, viewW - inset.right - margin - halfW),
    y: Phaser.Math.Clamp(centerY, inset.top + margin + halfH, viewH - inset.bottom - margin - halfH),
  };
}

function formatBreakdown(results: ShiftResults): string {
  const b = results.breakdown;
  const lines = [
    `In-store  ×${b.inStore}   ·   +${b.inStore * SCORE_INSTORE}`,
    `Pickups  ×${b.pickups}   ·   +${b.pickups * SCORE_PICKUP}`,
    `On-time drops  ×${b.deliveriesOnTime}   ·   +${b.deliveriesOnTime * SCORE_DELIVERY_ON_TIME}`,
    `Late drops  ×${b.deliveriesLate}   ·   ${b.deliveriesLate * SCORE_DELIVERY_LATE}`,
    `Fails  ×${b.fails}   ·   ${b.fails * SCORE_FAIL}`,
  ];
  return lines.join("\n");
}
