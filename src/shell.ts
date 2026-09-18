import { Color } from "./ui/theme";
import { GAME_HEIGHT, GAME_WIDTH } from "./sim/constants";
import {
  containStage,
  GAME_ASPECT,
  notifyViewfit,
  phaserDisplayScale,
  RAIL_MIN_CSS_PX,
  readCssSafeArea,
  setStageContainScale,
  setStageFrame,
  stageContainScale,
} from "./ui/viewFit";

/** Short edge at or below this is treated as phone-sized when coarse is absent. */
export const PHONE_SHORT_EDGE_MAX_PX = 480;

/**
 * Phone-like viewport: coarse pointer, or a short edge typical of handsets.
 * Chrome device toolbar often omits `(pointer: coarse)` — use the same heuristic
 * as the portrait rotate-gate (narrow short edge).
 */
export function isPhoneLikeViewport(
  width: number,
  height: number,
  coarsePointer: boolean,
): boolean {
  if (coarsePointer) return true;
  return Math.min(width, height) <= PHONE_SHORT_EDGE_MAX_PX;
}

/** Phone-sized portrait: shop is 16:9 landscape, so ask them to turn. */
export function isPortraitPhone(
  width: number,
  height: number,
  coarsePointer: boolean,
): boolean {
  if (height <= width + 24) return false;
  return isPhoneLikeViewport(width, height, coarsePointer);
}

export function viewportSize(): { width: number; height: number } {
  const view = globalThis.visualViewport;
  return {
    width: Math.round(view?.width ?? globalThis.innerWidth ?? 0),
    height: Math.round(view?.height ?? globalThis.innerHeight ?? 0),
  };
}

export function isStandaloneDisplay(
  matchMedia: ((query: string) => { matches: boolean }) | undefined = globalThis.matchMedia,
  standaloneFlag = false,
): boolean {
  if (matchMedia?.("(display-mode: standalone)")?.matches) return true;
  if (matchMedia?.("(display-mode: fullscreen)")?.matches) return true;
  return standaloneFlag;
}

export function tryLockLandscape(orientation: Pick<ScreenOrientation, "lock"> | null | undefined): boolean {
  if (!orientation || typeof orientation.lock !== "function") return false;
  void orientation.lock("landscape").catch(() => undefined);
  return true;
}

/** Keep Phaser pointer mapping aligned after CSS sizes the canvas. */
export function applyCanvasDisplayScale(game: Phaser.Game): void {
  const canvas = game.canvas;
  if (!canvas) return;
  game.scale.updateBounds();
  const w = game.scale.canvasBounds?.width || canvas.clientWidth;
  const h = game.scale.canvasBounds?.height || canvas.clientHeight;
  if (w <= 0 || h <= 0) return;
  // Live backbuffer size when RenderBudget scales below design 1920×1080.
  // Pointers map CSS → buffer px; camera zoom maps buffer → design/world coords.
  const gw = game.scale.gameSize?.width || game.scale.width || GAME_WIDTH;
  const gh = game.scale.gameSize?.height || game.scale.height || GAME_HEIGHT;
  const scale = phaserDisplayScale({ width: w, height: h }, gw, gh);
  game.scale.displayScale.set(scale.x, scale.y);
}

function layoutRails(
  leftRail: HTMLElement | null,
  rightRail: HTMLElement | null,
  railLeft: number,
  railRight: number,
  viewH: number,
): void {
  const showLeft = railLeft >= RAIL_MIN_CSS_PX;
  const showRight = railRight >= RAIL_MIN_CSS_PX;
  if (leftRail) {
    leftRail.hidden = !showLeft;
    leftRail.style.width = `${Math.max(0, Math.round(railLeft))}px`;
    leftRail.style.height = `${Math.round(viewH)}px`;
    leftRail.style.top = "0px";
    leftRail.style.left = "0px";
  }
  if (rightRail) {
    rightRail.hidden = !showRight;
    rightRail.style.width = `${Math.max(0, Math.round(railRight))}px`;
    rightRail.style.height = `${Math.round(viewH)}px`;
    rightRail.style.top = "0px";
    rightRail.style.right = "0px";
  }
}

/**
 * Layout the 16:9 playfield.
 * Always **contain** so the full design stays visible (no height/width-fill crop that
 * reads as zoomed-in). Leftover width becomes Kindling/Shift side rails when wide enough.
 */
export function installMobileShell(game: Phaser.Game): void {
  const shell = document.getElementById("kindling-shell");
  const root = document.getElementById("game-root");
  const gate = document.getElementById("rotate-gate");
  const leftRail = document.getElementById("rail-left");
  const rightRail = document.getElementById("rail-right");
  if (!root) return;

  const coarse = () => globalThis.matchMedia?.("(pointer: coarse)")?.matches ?? false;

  const sync = (): void => {
    const { width, height } = viewportSize();
    const view = globalThis.visualViewport;
    const ox = Math.round(view?.offsetLeft ?? 0);
    const oy = Math.round(view?.offsetTop ?? 0);
    if (shell) {
      shell.style.width = `${width}px`;
      shell.style.height = `${height}px`;
      shell.style.transform = `translate(${ox}px, ${oy}px)`;
      shell.style.background = Color.skyTopHex;
    }
    document.documentElement.style.background = Color.skyTopHex;
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute("content", Color.skyTopHex);

    const packed = containStage({ width, height }, GAME_ASPECT, "contain");
    // Publish contain scale before viewfit so type floors / mobile ramp see it.
    setStageContainScale(stageContainScale(packed.stage));
    setStageFrame(packed.stage);
    const sw = Math.round(packed.stage.width);
    const sh = Math.round(packed.stage.height);
    const sl = Math.round(packed.stage.left);
    const st = Math.round(packed.stage.top);
    root.style.width = `${sw}px`;
    root.style.height = `${sh}px`;
    root.style.left = `${sl}px`;
    root.style.top = `${st}px`;
    root.style.transform = "";

    layoutRails(leftRail, rightRail, packed.railLeft, packed.railRight, height);

    if (gate) {
      const portrait = isPortraitPhone(width, height, coarse());
      gate.hidden = !portrait;
      gate.setAttribute("aria-hidden", portrait ? "false" : "true");
    }
    game.scale.refresh();
    applyCanvasDisplayScale(game);
    // Viewfit follows the stage (canvas), not the full phone chrome.
    notifyViewfit(game, { width: sw, height: sh }, readCssSafeArea(shell ?? root));
  };

  const blockScroll = (event: Event): void => {
    event.preventDefault();
  };

  const blockPinch = (event: TouchEvent): void => {
    if (event.touches.length > 1) event.preventDefault();
  };

  document.addEventListener("touchstart", blockPinch, { passive: false });
  document.addEventListener("touchmove", blockScroll, { passive: false });
  document.addEventListener("gesturestart", blockScroll, { passive: false });
  document.addEventListener("gesturechange", blockScroll, { passive: false });

  globalThis.addEventListener("resize", sync);
  globalThis.addEventListener("scroll", sync, { passive: true });
  globalThis.visualViewport?.addEventListener("resize", sync);
  globalThis.visualViewport?.addEventListener("scroll", sync);
  globalThis.addEventListener("orientationchange", () => {
    globalThis.setTimeout(sync, 50);
    globalThis.setTimeout(sync, 300);
    globalThis.setTimeout(sync, 600);
  });

  const nav = navigator as Navigator & { standalone?: boolean };
  const tryLandscape = (): void => {
    tryLockLandscape(screen.orientation);
  };
  if (isStandaloneDisplay(globalThis.matchMedia, nav.standalone === true)) {
    tryLandscape();
  }
  document.addEventListener("pointerdown", tryLandscape);

  sync();
}
