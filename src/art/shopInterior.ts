import Phaser from "phaser";
import {
  BACK_DOOR,
  BACK_DOOR_H,
  BACK_DOOR_W,
  BAG_STACK,
  BENCH,
  BENCH_LEFT,
  BENCH_W,
  CHAIR_RAIL_GREY_H,
  CHAIR_RAIL_WHITE_H,
  CHAIR_RAIL_Y,
  COUNTER_FACE_SHADE_H,
  COUNTER_FRONT,
  COUNTER_LEFT,
  COUNTER_PLANT,
  COUNTER_RIGHT,
  COUNTER_SIGN,
  COUNTER_TOP,
  DOOR,
  DOOR_H,
  DOOR_W,
  PASS_WINDOW,
  SILL_H,
  SILL_Y,
  ITEMS_PER_TV,
  TV_BEZEL,
  TV_COUNT,
  TV_H,
  TV_W,
  WINDOW,
  WINDOW_TOP,
  ceilingPots,
  tabletLayout,
  tvPos,
} from "../maps/shopT0";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import { skyAt, type SkySample } from "../sim/dayNight";
import { addUiText } from "../ui/text";
import { addMark, fitTypeToWidth } from "../ui/typekit";
import { HOURS } from "../ui/copy";
import { Color, Type } from "../ui/theme";
import { Pal } from "./palette";
import { PX, fill, snap } from "./px";
import { paintSky } from "./skyPaint";

const WALL = 0xe6dfd4;
const WAINSCOT = 0xddd4c8;
/** Sign field — plain white so the leaf border and ink mark carry the contrast. */
const SIGN_WHITE = 0xffffff;
const WAINSCOT_LINE = 0xc4b9ac;

const PAINT = 0xf2f2f0;
const PAINT_HI = 0xffffff;
const PAINT_SHADE = 0xd0d2d4;
const PAINT_EDGE = 0xa8acb0;
const PAINT_GROOVE = 0x8e9090;
const PAINT_PANEL = 0xc4c6c8;
const JAMB = 0x6e7070;
const JAMB_DARK = 0x4a4c4e;
const JAMB_HI = 0xa4a6a6;

/**
 * Delivery window only. The wall partition and both doors keep the neutral PAINT/JAMB
 * greys; the driver's glass gets the same greys pulled a few shades cooler so the bay
 * reads as its own steel-framed service hatch without leaving the shop palette.
 */
const WIN_PAINT = 0xe9eef4;
const WIN_PAINT_HI = 0xf2f7fc;
const WIN_PAINT_SHADE = 0xc6cdd4;
const WIN_PAINT_EDGE = 0x9aa4ae;
const WIN_JAMB = 0x64696e;
const WIN_JAMB_DARK = 0x42474c;
const WIN_JAMB_HI = 0x99a1a8;

const JAR = [0x3d6a44, 0xc4a060, 0xc86a38, 0x5a9a62, 0xb89258, 0x7a4a28];

function fillClipped(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  clip: { x: number; y: number; w: number; h: number },
  alpha = 1,
): void {
  const x0 = Math.max(x, clip.x);
  const y0 = Math.max(y, clip.y);
  const x1 = Math.min(x + w, clip.x + clip.w);
  const y1 = Math.min(y + h, clip.y + clip.h);
  if (x1 - x0 < PX || y1 - y0 < PX) return;
  fill(g, x0, y0, x1 - x0, y1 - y0, color, alpha);
}

function drawJars(
  g: Phaser.GameObjects.Graphics,
  x: number,
  shelfY: number,
  count: number,
  gap: number,
  clip?: { x: number; y: number; w: number; h: number },
): void {
  const paint = clip
    ? (jx: number, jy: number, jw: number, jh: number, color: number, alpha = 1) =>
        fillClipped(g, jx, jy, jw, jh, color, clip, alpha)
    : (jx: number, jy: number, jw: number, jh: number, color: number, alpha = 1) =>
        fill(g, jx, jy, jw, jh, color, alpha);
  for (let j = 0; j < count; j++) {
    const jx = x + j * gap;
    const jh = 16 + (j % 3) * 5;
    paint(jx, shelfY - jh, 11, jh, JAR[(j + count) % JAR.length]!);
    paint(jx + 2, shelfY - jh, 7, 3, 0xe8d8b0);
    paint(jx + 3, shelfY - jh + 5, 5, 5, 0x2a4a30, 0.35);
  }
}

function drawProductRoom(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  const clip = { x, y, w, h };
  fillClipped(g, x, y, w, h, 0x241c16, clip);
  fillClipped(g, x, y, w, Math.floor(h * 0.18), 0x1a1410, clip, 0.45);
  fillClipped(g, x, y + Math.floor(h * 0.8), w, h - Math.floor(h * 0.8), 0x1a120c, clip);

  const inset = 8;
  const innerL = x + inset;
  const innerW = w - inset * 2;
  const postW = 7;
  fillClipped(g, innerL, y + 12, postW, h - 20, 0x5a3a22, clip);
  fillClipped(g, innerL + innerW - postW, y + 12, postW, h - 20, 0x4a2e1a, clip);

  for (const t of [0.24, 0.5, 0.76]) {
    const sy = y + Math.floor(h * t);
    fillClipped(g, innerL, sy, innerW, 7, 0x8b5a32, clip);
    fillClipped(g, innerL, sy, innerW, 3, 0xc4a070, clip);
    fillClipped(g, innerL + 3, sy + 7, innerW - 6, 3, 0x3a2818, clip, 0.35);
    drawJars(g, innerL + 14, sy, Math.max(3, Math.floor((innerW - 28) / 22)), 22, clip);
  }
}

function drawPassWindow(g: Phaser.GameObjects.Graphics): void {
  const left = PASS_WINDOW.x - PASS_WINDOW.w / 2;
  const top = PASS_WINDOW.y;
  const w = PASS_WINDOW.w;
  const h = PASS_WINDOW.h;
  const reveal = 8;

  fill(g, left - reveal, top - reveal, w + reveal * 2, h + reveal, JAMB_DARK);
  fill(g, left - reveal + 4, top - reveal + 4, w + reveal * 2 - 4, h + reveal - 4, JAMB);
  fill(g, left - reveal, top - reveal, w + reveal * 2, 8, JAMB_HI);
  fill(g, left - reveal, top, 8, h, JAMB_DARK);
  fill(g, left + w, top, 8, h, JAMB);

  drawProductRoom(g, left, top, w, h);

  fill(g, left, top, w, 8, PAINT_HI);
  fill(g, left, top, 8, h, PAINT_HI);
  fill(g, left + w - 8, top, 8, h, PAINT_EDGE);
  fill(g, left, top + h - 8, w, 8, PAINT_SHADE);
}

function drawSillBench(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(8);
  const left = PASS_WINDOW.x - PASS_WINDOW.w / 2 - 12;
  const w = PASS_WINDOW.w + 24;
  const top = SILL_Y;
  const h = SILL_H;

  fill(g, left + 6, top + h, w - 4, 6, 0x1a1008, 0.35);
  fill(g, left, top, w, h, 0xb49464);
  fill(g, left, top, w, 6, 0xccb080);
  fill(g, left, top, w, 3, 0xd8c498);
  fill(g, left, top + h - 4, w, 4, 0xa07c54);
  fill(g, left, top + 6, 6, h - 6, 0xd0b888);
  fill(g, left + w - 8, top + 6, 8, h - 6, 0xa07c54);
  for (let x = left + 16; x < left + w - 12; x += 20) {
    fill(g, x, top + 4, PX, h - 8, 0xa88858, 0.4);
  }
  return g;
}

function drawTabletShell(g: Phaser.GameObjects.Graphics, left: number, top: number, w: number, h: number): void {
  g.fillStyle(0x121416, 1);
  g.fillRoundedRect(left - 3, top - 3, w + 6, h + 6, 8);
  g.fillStyle(0x2a2e32, 1);
  g.fillRoundedRect(left, top, w, h, 6);
  g.fillStyle(0x3a3e42, 1);
  g.fillRoundedRect(left + 2, top + 2, w - 4, h - 4, 4);
  g.fillStyle(0x080a0c, 1);
  g.fillRoundedRect(left + 16, top + 8, w - 32, h - 16, 3);
  fill(g, left + 5, top + h / 2 - 4, 8, 8, 0x4a5056);
  fill(g, left + 7, top + h / 2 - 2, 4, 4, 0x1a2830);
  fill(g, left + w - 12, top + h / 2 - 14, 4, 28, 0xc8ccd0);
}

function drawTabletOnSill(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(9);
  const orders = tabletLayout();
  drawTabletShell(g, orders.left, orders.top, orders.w, orders.h);
  fill(g, orders.left + 10, orders.top + orders.h - 2, orders.w - 20, 6, 0x1a1008, 0.35);
  return g;
}

/** Lightning/USB-C cable on the oak sill into a wall outlet by the pass-through. Depth 8: on the sill, under tablet 9+, over people 5. Plugs into the center of the landscape tablet's right short end. */
function drawTabletCharger(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(8);
  const orders = tabletLayout();
  const tabRight = snap(orders.left + orders.w);
  const plugY = snap(orders.top + orders.h / 2);
  const outX = snap(PASS_WINDOW.x + PASS_WINDOW.w / 2 + 16);
  const outY = snap(SILL_Y + SILL_H + 8);
  const onSillY = snap(SILL_Y + 6);
  const startX = tabRight + 8;
  const cable = 0xe8eaee;
  const cableSh = 0xa8acb0;

  fill(g, outX, outY, 24, 32, PAINT);
  fill(g, outX, outY, 24, 4, PAINT_HI);
  fill(g, outX + 20, outY + 4, 4, 24, PAINT_SHADE);
  fill(g, outX, outY + 28, 24, 4, PAINT_EDGE);
  fill(g, outX + 4, outY + 8, 8, 8, PAINT_EDGE);
  fill(g, outX + 12, outY + 8, 8, 8, PAINT_EDGE);
  fill(g, outX + 6, outY + 10, 4, 4, JAMB_DARK);
  fill(g, outX + 14, outY + 10, 4, 4, JAMB_DARK);
  fill(g, outX + 10, outY + 20, 4, 4, PAINT_GROOVE);

  fill(g, tabRight - 4, plugY - 8, 8, 16, 0x1a1c1e);
  fill(g, tabRight, plugY - 6, 12, 12, 0xc8ccd0);
  fill(g, tabRight + 4, plugY - 4, 8, 8, 0xe8eaee);
  fill(g, tabRight + 8, plugY - 2, 4, 4, 0x4a5056);

  const dropH = Math.max(PX, onSillY - (plugY - 2));
  fill(g, startX, plugY - 2, 4, dropH, cable);
  fill(g, startX + 4, plugY - 2, 4, dropH, cableSh);
  const runW = Math.max(PX, outX + 4 - startX);
  fill(g, startX, onSillY, runW, 4, cable);
  fill(g, startX, onSillY + 4, runW, 4, cableSh);
  const sagX = snap(startX + runW / 2 - 12);
  fill(g, sagX, onSillY + 4, 24, 4, cable);
  fill(g, sagX, onSillY + 8, 24, 4, cableSh);
  const downH = Math.max(PX, outY + 12 - onSillY);
  fill(g, outX + 4, onSillY, 4, downH, cable);
  fill(g, outX + 8, onSillY, 4, downH, cableSh);
  fill(g, outX - 4, outY + 10, 8, 8, 0x1a1c1e);
  fill(g, outX - 2, outY + 12, 6, 4, 0x4a5056);
  return g;
}

function tvBezel(g: Phaser.GameObjects.Graphics, left: number, top: number, w: number, h: number): void {
  const bezel = TV_BEZEL;
  // Thin plaster reveal + drop shadow so the set sits on the wall, not in it.
  fill(g, left - PX, top - PX, w + PX * 2, h + PX * 2, 0x3a342c, 0.38);
  fill(g, left + PX, top + h, w, PX * 2, 0x2a261e, 0.5);
  // Bottom mount rail — a little depth so they are not three flat slabs.
  fill(g, left + 28, top + h + PX, w - 56, PX * 2, 0x1a1816);
  fill(g, left + 44, top + h + PX * 2, w - 88, PX, 0x121010);

  fill(g, left, top, w, h, 0x141618);
  fill(g, left, top, w, PX, 0x3c4044);
  fill(g, left, top, PX, h, 0x2c3034);
  fill(g, left + w - PX, top + PX, PX, h - PX, 0x0a0c0e);
  fill(g, left, top + h - PX * 2, w, PX * 2, 0x0c0e10);

  fill(g, left + PX * 2, top + PX * 2, w - PX * 4, h - PX * 4, 0x0a0c0e);
  fill(g, left + PX * 2, top + PX * 2, w - PX * 4, PX, 0x2a2e32);
  fill(g, left + PX * 2, top + PX * 2, PX, h - PX * 4, 0x1c2024);

  const glassL = left + bezel;
  const glassT = top + bezel;
  const glassW = w - bezel * 2;
  const glassH = h - bezel * 2;
  fill(g, glassL, glassT, glassW, glassH, 0x080c0a);
  fill(g, glassL + PX, glassT + PX, glassW - PX * 2, PX * 2, 0x1a2820, 0.42);
  fill(g, glassL + PX * 2, glassT + PX, Math.floor(glassW * 0.36), PX, 0xffffff, 0.07);

  const slotH = Math.floor(glassH / ITEMS_PER_TV);
  const divL = glassL + PX * 2;
  const divW = glassW - PX * 4;
  for (let s = 1; s < ITEMS_PER_TV; s++) {
    fill(g, divL, glassT + s * slotH, divW, PX, 0x1a2a22);
  }
}

const POT_HOT = 0xffe8b0;

function potCan(g: Phaser.GameObjects.Graphics, x: number): void {
  fill(g, x - 18, 4, 36, 22, 0x1a1410);
  fill(g, x - 14, 6, 28, 16, 0x2a2218);
  fill(g, x - 12, 10, 24, 10, Color.gold);
  fill(g, x - 8, 12, 16, 8, POT_HOT);
  fill(g, x - 4, 14, 8, 5, 0xfff6d8);
}

/** Soft tungsten pools on the cream wall — stay above the chair rail / floor. Skip the window bay. */
function potWallWash(g: Phaser.GameObjects.Graphics, x: number): void {
  const winLeft = WINDOW.x - WINDOW.w / 2;
  const winRight = WINDOW.x + WINDOW.w / 2;
  if (x >= winLeft && x <= winRight) return;
  const wallBottom = CHAIR_RAIL_Y - 8;
  const rings = [
    { y: 118, w: 200, h: 120, a: 0.15 },
    { y: 118, w: 120, h: 84, a: 0.2 },
    { y: 128, w: 64, h: 48, a: 0.24 },
  ];
  for (const r of rings) {
    const maxH = Math.max(16, (wallBottom - r.y) * 2);
    const h = Math.min(r.h, maxH);
    if (h < 16) continue;
    g.fillStyle(POT_HOT, r.a);
    g.fillEllipse(x, r.y, r.w, h);
  }
}

/** Soft oval pools on the lobby boards under each can — wider sideways, not a slash. */
function potFloorPool(g: Phaser.GameObjects.Graphics, x: number): void {
  const y = COUNTER_FRONT + 92;
  const rings = [
    { w: 360, h: 220, a: 0.055 },
    { w: 220, h: 150, a: 0.075 },
    { w: 130, h: 100, a: 0.07 },
  ];
  for (const r of rings) {
    g.fillStyle(POT_HOT, r.a);
    g.fillEllipse(x, y, r.w, r.h);
  }
}

type Clip = { x: number; y: number; w: number; h: number };

/** Shared street width; each pane crops a different slice. */
const STREET_W = 420;

function streetOriginX(paneX: number, paneW: number, kind: "wide" | "door"): number {
  return kind === "wide" ? paneX - Math.floor((STREET_W - paneW) / 2) : paneX - 188;
}

function drawSkyline(g: Phaser.GameObjects.Graphics, originX: number, y: number, h: number, sky: SkySample, clip: Clip): void {
  const blocks = [
    [36, 44, 0.4],
    [248, 32, 0.5],
    [356, 36, 0.36],
  ] as const;
  for (const [sx, bw, hf] of blocks) {
    const bh = Math.floor(h * hf);
    const top = y + Math.floor(h * 0.12);
    fillClipped(g, originX + sx, top, bw, bh, sky.roof, clip);
    fillClipped(g, originX + sx + 8, top + 12, 8, 10, 0xf0c070, clip, 0.1 + 0.45 * sky.windowGlow);
  }
}

function drawShopfront(
  g: Phaser.GameObjects.Graphics,
  sx: number,
  walkY: number,
  bw: number,
  bh: number,
  clip: Clip,
  sky: SkySample,
  spec: {
    wall: number;
    hi: number;
    shade: number;
    trim: number;
    awning: number;
    stripe?: number;
    shop: "brick" | "boutique" | "cafe" | "florist";
    floors: number;
  },
): void {
  const top = walkY - bh;
  fillClipped(g, sx, top, bw, bh, spec.wall, clip);
  fillClipped(g, sx, top, PX, bh, spec.hi, clip);
  fillClipped(g, sx + bw - PX, top, PX, bh, spec.shade, clip);
  fillClipped(g, sx - PX, top, bw + PX * 2, 8, spec.trim, clip);
  fillClipped(g, sx - PX, top, bw + PX * 2, PX, spec.hi, clip);

  if (spec.shop === "brick") {
    for (let ly = top + 12; ly < walkY - 48; ly += 8) {
      fillClipped(g, sx + 4, ly, bw - 8, PX, spec.shade, clip, 0.35);
    }
  }

  const storeyH = Math.max(16, Math.floor((bh - 52) / spec.floors));
  const winW = spec.floors >= 4 ? 10 : 12;
  const gap = winW + 8;
  const count = Math.max(1, Math.floor((bw - 16) / gap));
  const start = sx + Math.floor((bw - count * gap + 8) / 2);
  const lit = sky.windowGlow;
  const glass = lit > 0.25 ? 0xf0c070 : Pal.glass;
  for (let f = 0; f < spec.floors - 1; f++) {
    const fy = top + 16 + f * storeyH;
    for (let i = 0; i < count; i++) {
      fillClipped(g, start + i * gap, fy, winW, Math.max(PX * 2, storeyH - 12), glass, clip, 0.35 + 0.55 * lit);
      fillClipped(g, start + i * gap, fy, winW, PX, Pal.cream, clip, 0.3);
    }
  }

  const awnY = walkY - 44;
  fillClipped(g, sx + 4, awnY - 12, bw - 8, 10, spec.trim, clip);
  if (spec.shop === "cafe") fillClipped(g, sx + 8, awnY - 10, bw - 16, 6, Pal.gold, clip);
  else if (spec.shop === "florist") fillClipped(g, sx + 8, awnY - 10, bw - 16, 6, Pal.leaf, clip);
  else if (spec.shop === "boutique") {
    fillClipped(g, sx + 8, awnY - 10, bw - 16, 6, Pal.woodDark, clip);
    fillClipped(g, sx + 12, awnY - 8, 8, PX, Pal.gold, clip);
    fillClipped(g, sx + 24, awnY - 8, 6, PX, Pal.gold, clip);
  } else {
    fillClipped(g, sx + 8, awnY - 10, bw - 16, 6, Pal.rust, clip);
  }

  fillClipped(g, sx + 2, awnY, bw - 4, 12, spec.awning, clip);
  if (spec.stripe) {
    for (let ax = sx + 6; ax < sx + bw - 8; ax += 12) {
      fillClipped(g, ax, awnY, 6, 12, spec.stripe, clip);
    }
  }
  fillClipped(g, sx + 2, awnY, bw - 4, PX, Pal.cream, clip, 0.35);

  const dw = Math.max(PX * 3, Math.floor((bw - 24) / 2));
  const dh = 24;
  const dy = walkY - dh - 4;
  const glow = 0.22 + 0.7 * sky.windowGlow;
  fillClipped(g, sx + 6, dy, dw, dh, 0x2a2218, clip);
  fillClipped(g, sx + 8, dy + 2, dw - 4, dh - 6, 0xf0c070, clip, glow);
  fillClipped(g, sx + bw - 6 - dw, dy, dw, dh, 0x2a2218, clip);
  fillClipped(g, sx + bw - 4 - dw, dy + 2, dw - 4, dh - 6, 0xf0c070, clip, glow * 0.85);
  fillClipped(g, sx + Math.floor(bw / 2) - 4, dy + 4, 8, dh - 4, Pal.woodDark, clip);

  if (spec.shop === "florist") {
    fillClipped(g, sx + 8, dy - 4, dw - 4, 6, Pal.wood, clip);
    fillClipped(g, sx + 10, dy - 8, PX, PX, Pal.leaf, clip);
    fillClipped(g, sx + 16, dy - 10, PX, PX, Pal.gold, clip);
    fillClipped(g, sx + 22, dy - 8, PX, PX, Pal.blush, clip);
    fillClipped(g, sx + bw - dw, dy - 4, dw - 8, 6, Pal.wood, clip);
    fillClipped(g, sx + bw - dw + 4, dy - 8, PX, PX, Color.leafBright, clip);
    fillClipped(g, sx + bw - dw + 12, dy - 10, PX, PX, Pal.amber, clip);
  }
}

function drawStreetLamp(g: Phaser.GameObjects.Graphics, lx: number, lampTop: number, poleH: number, sky: SkySample, clip: Clip): void {
  fillClipped(g, lx, lampTop + 16, 6, poleH, 0x1a1014, clip);
  fillClipped(g, lx - 16, lampTop + 12, 22, 4, 0x1a1014, clip);
  fillClipped(g, lx - 20, lampTop - 4, 26, 4, 0x2a1824, clip);
  if (sky.lampAlpha > 0.05) {
    fillClipped(g, lx - 18, lampTop, 22, 14, 0xf0c070, clip, sky.lampAlpha);
    fillClipped(g, lx - 14, lampTop + 4, 14, 6, Color.cream, clip, sky.lampAlpha);
    fillClipped(g, lx - 12, lampTop + 6, 8, 4, 0xfff0c0, clip, sky.lampAlpha);
  }
}

function drawStreetCar(
  g: Phaser.GameObjects.Graphics,
  left: number,
  top: number,
  dir: 1 | -1,
  body: number,
  sky: SkySample,
  clip: Clip,
  kind: "wide" | "door",
): void {
  const cw = kind === "wide" ? 56 : 36;
  const ch = kind === "wide" ? 20 : 16;
  const cabin = kind === "wide" ? 16 : 12;
  const wheel = kind === "wide" ? 8 : 6;
  fillClipped(g, left + 4, top + ch - PX, cw - 8, PX * 2, Pal.shadow, clip, 0.45);
  fillClipped(g, left, top + 6, cw, ch - 8, body, clip);
  fillClipped(g, left + 4, top + 4, cw - 8, 6, body, clip);
  fillClipped(g, left + PX, top + 6, cw - PX * 2, PX, Pal.cream, clip, 0.22);
  const cabinX = dir === 1 ? left + 8 : left + cw - 8 - cabin - 10;
  fillClipped(g, cabinX, top, cabin + 10, 8, Pal.denimDark, clip);
  fillClipped(g, cabinX + 2, top + PX, cabin, 6, Pal.glass, clip);
  fillClipped(g, left + 6, top + ch - 6, wheel, 6, Pal.shoe, clip);
  fillClipped(g, left + cw - 6 - wheel, top + ch - 6, wheel, 6, Pal.shoe, clip);
  const night = Math.max(sky.lampAlpha, sky.moonAlpha * 0.65);
  const head = dir === 1 ? left + cw - 4 : left;
  const tail = dir === 1 ? left : left + cw - 4;
  fillClipped(g, head, top + 8, 4, 4, Color.cream, clip, 0.35 + 0.65 * night);
  fillClipped(g, tail, top + 8, 4, 4, Pal.amber, clip, 0.4 + 0.5 * night);
  if (night > 0.12) {
    const beamX = dir === 1 ? left + cw : left - 12;
    fillClipped(g, beamX, top + 8, 12, 4, 0xfff0c0, clip, 0.18 * night);
  }
}

/** Shop-window traffic pace — 2× travel time ≈ half speed (Luke polish #74). */
const SHOP_WINDOW_CAR_SLOWDOWN = 2;

/** Periods keep a car entering at hour=12 and hour=20.5 (those gameMs land on 15000). */
const STREET_CARS: { period: number; offset: number; travel: number; dir: 1 | -1; body: number; lane: number }[] = [
  { period: 15000, offset: 0, travel: 3500, dir: 1, body: Pal.rust, lane: 0 },
  { period: 22000, offset: 9000, travel: 2800, dir: -1, body: Pal.denim, lane: 8 },
  { period: 31000, offset: 18000, travel: 2600, dir: 1, body: Pal.leafDark, lane: 0 },
];

function paintPassingCars(
  g: Phaser.GameObjects.Graphics,
  originX: number,
  streetY: number,
  sky: SkySample,
  clip: Clip,
  kind: "wide" | "door",
  gameMs: number,
): void {
  const cw = kind === "wide" ? 56 : 36;
  const span = STREET_W + cw * 2;
  for (const car of STREET_CARS) {
    if (kind === "door" && car.period > 23000) continue;
    const travel = car.travel * SHOP_WINDOW_CAR_SLOWDOWN;
    const phase = ((gameMs + car.offset) % car.period + car.period) % car.period;
    if (phase >= travel) continue;
    const t = phase / travel;
    const x = car.dir === 1 ? originX - cw + t * span : originX + STREET_W - t * span;
    drawStreetCar(g, x, streetY + car.lane, car.dir, car.body, sky, clip, kind);
  }
}

function paintBoutiqueBlock(
  g: Phaser.GameObjects.Graphics,
  originX: number,
  y: number,
  h: number,
  sky: SkySample,
  clip: Clip,
): void {
  const walkY = y + Math.floor(h * 0.7);
  drawSkyline(g, originX, y, h, sky, clip);
  drawShopfront(g, originX + 8, walkY, 96, Math.floor(h * 0.54), clip, sky, {
    wall: Pal.rust,
    hi: Pal.amber,
    shade: Pal.rustDark,
    trim: Pal.woodDark,
    awning: Pal.creamSoft,
    shop: "brick",
    floors: 4,
  });
  drawShopfront(g, originX + 108, walkY, 92, Math.floor(h * 0.46), clip, sky, {
    wall: Pal.creamSoft,
    hi: Pal.cream,
    shade: Pal.kraft,
    trim: Pal.wood,
    awning: Pal.denim,
    shop: "boutique",
    floors: 3,
  });
  drawShopfront(g, originX + 204, walkY, 104, Math.floor(h * 0.44), clip, sky, {
    wall: Pal.wall,
    hi: 0xffffff,
    shade: Pal.wainscot,
    trim: Pal.woodTrim,
    awning: Pal.cream,
    stripe: Pal.amber,
    shop: "cafe",
    floors: 3,
  });
  drawShopfront(g, originX + 312, walkY, 100, Math.floor(h * 0.36), clip, sky, {
    wall: Pal.leaf,
    hi: Color.leafBright,
    shade: Pal.leafDark,
    trim: Pal.woodDark,
    awning: Pal.creamSoft,
    stripe: Pal.leafDark,
    shop: "florist",
    floors: 2,
  });
}

function paintStreet(
  g: Phaser.GameObjects.Graphics,
  originX: number,
  y: number,
  h: number,
  clip: Clip,
): void {
  const walkY = y + Math.floor(h * 0.7);
  const curbY = y + Math.floor(h * 0.76);
  const roadY = y + Math.floor(h * 0.78);
  fillClipped(g, originX, walkY, STREET_W, curbY - walkY, Pal.curb, clip);
  fillClipped(g, originX, walkY, STREET_W, PX, Pal.cream, clip, 0.2);
  fillClipped(g, originX, curbY, STREET_W, roadY - curbY, Pal.asphaltLite, clip);
  fillClipped(g, originX, roadY, STREET_W, y + h - roadY, Pal.asphaltDark, clip);
  fillClipped(g, originX, roadY + PX, STREET_W, Math.max(PX, y + h - roadY - PX * 2), Pal.asphalt, clip);
  const dashY = roadY + Math.floor((y + h - roadY) * 0.42);
  for (let dx = originX + 8; dx < originX + STREET_W; dx += 28) {
    fillClipped(g, dx, dashY, 16, PX, Pal.dash, clip);
  }
}

function paintOutside(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  sky: SkySample,
  kind: "wide" | "door",
  gameMs = 0,
): void {
  const clip = { x, y, w, h };
  paintSky(g, x, y, w, h, sky, {
    showSun: kind === "wide",
    sunRadius: kind === "wide" ? 22 : 10,
    moonRadius: kind === "wide" ? 12 : 6,
  });

  const originX = streetOriginX(x, w, kind);
  paintBoutiqueBlock(g, originX, y, h, sky, clip);
  paintStreet(g, originX, y, h, clip);
  const lampX = originX + 300;
  const lampTop = y + Math.floor(h * 0.18);
  drawStreetLamp(g, lampX, lampTop, Math.floor(h * 0.52), sky, clip);
  const streetY = y + Math.floor(h * 0.8);
  paintPassingCars(g, originX, streetY, sky, clip, kind, gameMs);

  fill(g, x + 6, y + 8, Math.max(PX * 2, Math.floor(w * 0.05)), h - 16, Color.cream, 0.1);
}

function streetDoorGlass(): { x: number; y: number; w: number; h: number } {
  const left = DOOR.x - DOOR_W / 2;
  const top = COUNTER_FRONT - DOOR_H;
  const glassW = Math.floor(DOOR_W * 0.62);
  const glassH = Math.floor(DOOR_H * 0.52);
  return {
    x: left + Math.floor((DOOR_W - glassW) / 2),
    y: top + Math.floor(DOOR_H * 0.16),
    w: glassW,
    h: glassH,
  };
}

/**
 * Sash, centre mullion and chair rail over the delivery glass. Painted after the
 * sky in both the live day/night pass and the baked dusk backdrop, so the outside
 * never bleeds over the frame.
 */
function paintWindowSashAndRail(g: Phaser.GameObjects.Graphics): void {
  const winLeft = WINDOW.x - WINDOW.w / 2;
  const winTop = WINDOW_TOP;
  const winH = WINDOW.h;
  fill(g, winLeft, winTop, WINDOW.w, 8, WIN_PAINT_HI);
  fill(g, winLeft, winTop, 8, winH, WIN_PAINT_HI);
  fill(g, winLeft + WINDOW.w - 8, winTop, 8, winH, WIN_PAINT_EDGE);
  fill(g, WINDOW.x - 4, winTop, 8, winH, WIN_PAINT_EDGE);
  fill(g, winLeft, CHAIR_RAIL_Y, WINDOW.w, CHAIR_RAIL_GREY_H, WIN_PAINT_EDGE);
  fill(g, winLeft, CHAIR_RAIL_Y + CHAIR_RAIL_GREY_H, WINDOW.w, CHAIR_RAIL_WHITE_H, WIN_PAINT_HI);
}

/** Live sky in the delivery window only. Do not paint streetDoorGlass — the door is opaque. */
export function paintShopDayNight(g: Phaser.GameObjects.Graphics, gameMs: number): void {
  g.clear();
  const sky = skyAt(gameMs);
  const winLeft = WINDOW.x - WINDOW.w / 2;
  const winTop = WINDOW_TOP;
  const winH = WINDOW.h;
  paintOutside(g, winLeft, winTop, WINDOW.w, winH, sky, "wide", gameMs);
  paintWindowSashAndRail(g);
}

function drawDuskOutside(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, accent: "moon" | "lamp"): void {
  paintOutside(g, x, y, w, h, skyAt(0), accent === "moon" ? "wide" : "door");
}

function paintDoorHoursPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  fill(g, x, y, w, h, PAINT_EDGE);
  fill(g, x + PX, y + PX, w - PX * 2, h - PX * 2, Pal.creamSoft);
  fill(g, x + PX * 2, y + PX * 2, w - PX * 4, h - PX * 4, Pal.cream);
  fill(g, x + PX * 2, y + PX * 2, w - PX * 4, PX, PAINT_HI);
  fill(g, x + PX * 2, y + PX * 2, PX, h - PX * 4, PAINT_HI);
  fill(g, x + w - PX * 3, y + PX * 2, PX, h - PX * 4, Pal.kraft);
  fill(g, x + PX * 2, y + h - PX * 3, w - PX * 4, PX, Pal.kraft);
}

/**
 * Small optical shift so the hours line doesn't sit dead-centre in the pane.
 * Stepped one screen pixel right (was 6): the 1920px design space shows at
 * roughly 1024px, so a screen pixel is ~2 design px.
 */
const HOURS_NUDGE_X = 4;

function drawStreetDoorHours(scene: Phaser.Scene): Phaser.GameObjects.GameObject[] {
  const pane = streetDoorGlass();
  const cx = pane.x + pane.w / 2;
  const inset = 12;
  const maxW = pane.w - inset * 2;
  const mark = addMark(scene, cx, pane.y + Math.floor(pane.h * 0.34), {
    size: Type.heading,
    color: Color.inkHex,
    align: "center",
    maxWidth: maxW,
    maxHeight: Math.floor(pane.h * 0.28),
  })
    .setOrigin(0.5)
    .setDepth(1);
  // Nudged a hair left of the pane centre so the hours read under the mark's weight.
  const hours = addUiText(scene, cx - HOURS_NUDGE_X, pane.y + Math.floor(pane.h * 0.64), HOURS, {
    size: Type.body,
    color: Color.inkHex,
    fontStyle: "600",
    align: "center",
    lineSpacing: 3,
    strokeThickness: 0,
    noWrap: true,
    maxWidth: maxW,
    maxHeight: Math.floor(pane.h * 0.4),
  })
    .setOrigin(0.5)
    .setDepth(1);
  fitTypeToWidth(hours, maxW);
  return [mark, hours];
}

/** No painted window spill — shopGrade uses pots + ambient only. */
export function paintWindowGlow(g: Phaser.GameObjects.Graphics, _gameMs: number): void {
  g.clear();
}

function clipFill(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  clipBottom?: number,
  alpha = 1,
): void {
  if (clipBottom !== undefined) {
    const bottom = snap(clipBottom);
    const sy = snap(y);
    if (sy >= bottom) return;
    const sx = snap(x);
    const sw = Math.max(PX, snap(w) || PX);
    const sh = Math.min(Math.max(PX, snap(h) || PX), bottom - sy);
    if (sh < PX) return;
    g.fillStyle(color, alpha);
    g.fillRect(sx, sy, sw, sh);
    return;
  }
  fill(g, x, y, w, h, color, alpha);
}

function drawDoor(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  floorY: number,
  w: number,
  h: number,
  kind: "glass" | "panel",
  clipBottom?: number,
): void {
  const left = cx - w / 2;
  const top = floorY - h;

  if (kind === "glass") {
    const reveal = 8;
    const threshH = 16;
    fill(g, left - reveal, top - reveal, w + reveal * 2, h + reveal, JAMB_DARK);
    fill(g, left - reveal + 4, top - reveal + 4, w + reveal * 2 - 4, h + reveal - 4, JAMB);
    fill(g, left - reveal, top - reveal, w + reveal * 2, 8, JAMB_HI);
    fill(g, left - reveal, top - reveal, w + reveal * 2, 4, PAINT_HI);
    fill(g, left - reveal, top, 8, h, JAMB_DARK);
    fill(g, left + w, top, 8, h, JAMB);

    fill(g, left + 4, top + 4, w - 8, h - 4, PAINT);
    fill(g, left + 4, top + 4, 6, h - 4, PAINT_HI);
    fill(g, left + w - 10, top + 4, 6, h - 4, PAINT_SHADE);
    fill(g, left + 4, top + 4, w - 8, 6, PAINT_HI);

    fill(g, left - reveal, floorY, w + reveal * 2, threshH, Pal.wood);
    fill(g, left - reveal, floorY, w + reveal * 2, 4, Pal.woodLight);
    fill(g, left - reveal, floorY + threshH - 4, w + reveal * 2, 4, Pal.woodDark);
    fill(g, left - reveal, floorY, 4, threshH, Pal.woodLight);
    fill(g, left + w + reveal - 4, floorY, 4, threshH, Pal.woodDark);

    const glassW = Math.floor(w * 0.62);
    const glassH = Math.floor(h * 0.52);
    const glassX = left + Math.floor((w - glassW) / 2);
    const glassY = top + Math.floor(h * 0.16);
    fill(g, glassX - 8, glassY - 8, glassW + 16, glassH + 16, JAMB_DARK);
    fill(g, glassX - 4, glassY - 4, glassW + 8, glassH + 8, PAINT_HI);
    paintDoorHoursPanel(g, glassX, glassY, glassW, glassH);

    fill(g, left + 12, top + h - 40, w - 24, 40, JAMB);
    fill(g, left + 16, top + h - 36, w - 32, 4, JAMB_HI);
    fill(g, left + 12, top + h - 8, w - 24, 8, JAMB_DARK);

    const handleX = left + w - 22;
    const handleY = top + Math.floor(h * 0.48);
    fill(g, handleX - 6, handleY - 14, 16, 36, JAMB_DARK);
    fill(g, handleX - 2, handleY - 10, 8, 28, 0x6a6e72);
    fill(g, handleX, handleY - 8, 4, 24, 0xe8eaee);
    fill(g, handleX - 16, handleY - 4, 22, 8, 0xa8acb0);
    fill(g, handleX - 16, handleY - 4, 22, 3, 0xffffff);
    fill(g, handleX - 18, handleY - 2, 8, 6, 0xc8ccd0);
    return;
  }

  const stile = 24;
  const topRail = 24;
  const lockRail = 28;
  const paneW = w - stile * 2;
  const paneX = left + stile;
  const upperH = Math.floor(h * 0.36);
  const lockY = top + topRail + upperH;

  clipFill(g, left - 8, top - 8, w + 16, h + 8, Pal.ink, clipBottom);
  clipFill(g, left - 4, top - 4, w + 8, 8, Pal.woodLight, clipBottom);
  clipFill(g, left - 4, top, 8, h, Pal.woodDark, clipBottom);
  clipFill(g, left + w - 4, top, 8, h, Pal.shadow, clipBottom);

  clipFill(g, left, top, w, h, Pal.wood, clipBottom);
  clipFill(g, left, top, 8, h, Pal.woodLight, clipBottom);
  clipFill(g, left, top, w, 8, Pal.woodLight, clipBottom);
  clipFill(g, left + w - 8, top, 8, h, Pal.woodDark, clipBottom);

  for (let x = left + 12; x < left + w - 8; x += 16) {
    clipFill(g, x, top + 8, PX, h - 16, Pal.woodDark, clipBottom);
    clipFill(g, x + PX, top + 8, PX, h - 16, Pal.woodTrim, clipBottom);
  }

  clipFill(g, paneX, top + PX, paneW, topRail - PX, Pal.wood, clipBottom);
  clipFill(g, paneX, top + PX, paneW, PX, Pal.woodLight, clipBottom);
  for (let y = top + PX * 3; y < top + topRail - PX; y += PX * 2) {
    clipFill(g, paneX + PX, y, paneW - PX * 2, PX, Pal.woodDark, clipBottom);
  }

  const inset = (ix: number, iy: number, iw: number, ih: number) => {
    clipFill(g, ix, iy, iw, ih, Pal.ink, clipBottom);
    clipFill(g, ix + PX, iy + PX, iw - PX * 2, ih - PX * 2, Pal.shadow, clipBottom);
    clipFill(g, ix + PX * 2, iy + PX * 2, iw - PX * 4, ih - PX * 4, Pal.woodDark, clipBottom);
    clipFill(g, ix + PX, iy + PX, iw - PX * 2, PX, Pal.ink, clipBottom);
    clipFill(g, ix + PX, iy + PX, PX, ih - PX * 2, Pal.ink, clipBottom);
    clipFill(g, ix + PX, iy + ih - PX * 2, iw - PX * 2, PX, Pal.woodLight, clipBottom);
    clipFill(g, ix + iw - PX * 2, iy + PX, PX, ih - PX * 2, Pal.woodTrim, clipBottom);
    for (let x = ix + PX * 4; x < ix + iw - PX * 3; x += 12) {
      clipFill(g, x, iy + PX * 3, PX, ih - PX * 6, Pal.ink, clipBottom);
    }
  };
  clipFill(g, paneX - PX, top + topRail, PX, h - topRail - 24, Pal.ink, clipBottom);
  clipFill(g, paneX + paneW, top + topRail, PX, h - topRail - 24, Pal.ink, clipBottom);
  inset(paneX, top + topRail, paneW, upperH);

  clipFill(g, left + 8, lockY, w - 16, lockRail, Pal.wood, clipBottom);
  clipFill(g, left + 8, lockY, w - 16, PX, Pal.woodLight, clipBottom);
  clipFill(g, left + 8, lockY + lockRail - PX, w - 16, PX, Pal.woodDark, clipBottom);
  for (let y = lockY + PX * 2; y < lockY + lockRail - PX; y += PX * 2) {
    clipFill(g, left + 12, y, w - 24, PX, Pal.woodDark, clipBottom);
  }

  inset(paneX, lockY + lockRail, paneW, Math.floor(h * 0.38));

  const leverX = left + w - 22;
  const leverY = top + Math.floor(h * 0.48);
  clipFill(g, leverX - 6, leverY - 12, 16, 32, Pal.ink, clipBottom);
  clipFill(g, leverX - 2, leverY - 10, 8, 28, Pal.woodDark, clipBottom);
  clipFill(g, leverX, leverY - 8, 4, 24, Pal.gold, clipBottom);
  clipFill(g, leverX - 16, leverY - 4, 22, 8, Pal.woodLight, clipBottom);
  clipFill(g, leverX - 16, leverY - 4, 22, 3, Pal.cream, clipBottom);
  clipFill(g, leverX - 18, leverY - 2, 8, 6, Pal.gold, clipBottom);
}

const BOARD = [0xc4a878, 0xb49464, 0xccb080, 0xa07c54, 0xbe9c70];

function drawBoardFloor(g: Phaser.GameObjects.Graphics): void {
  const boardH = 32;
  let y = COUNTER_FRONT;
  let i = 0;
  while (y < GAME_HEIGHT) {
    const h = Math.min(boardH, GAME_HEIGHT - y);
    fill(g, 0, y, GAME_WIDTH, h, BOARD[i % BOARD.length]!);
    fill(g, 0, y, GAME_WIDTH, 4, 0xd0b888);
    fill(g, 0, y + h - 4, GAME_WIDTH, 4, 0x8a6038);
    const stagger = i % 2 === 0 ? 48 : 168;
    for (let x = stagger; x < GAME_WIDTH; x += 256) fill(g, x, y, PX, h, 0xb89068);
    fill(g, 80 + (i % 3) * 120, y + 8, 96, 4, i % 2 === 0 ? 0xd0b888 : 0x8a6038);
    y += boardH;
    i += 1;
  }
}

function drawKindlingMat(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics): Phaser.GameObjects.GameObject {
  const w = DOOR_W + 28;
  const h = 148;
  const x = DOOR.x - w / 2;
  const y = COUNTER_FRONT + 16;
  fill(g, x + 6, y + h - 4, w - 4, 10, 0x1a1008, 0.4);
  fill(g, x, y, w, h, Pal.leafDark);
  fill(g, x + 4, y + 4, w - 8, h - 8, Pal.leaf);
  fill(g, x + 8, y + 8, w - 16, h - 16, Color.leafBright);
  for (let i = y + 12; i < y + h - 12; i += 8) {
    fill(g, x + 10, i, w - 20, PX, Pal.leaf, 0.45);
  }
  fill(g, x + 4, y + 4, w - 8, 4, 0x7ab082);
  fill(g, x + 4, y + h - 8, w - 8, 4, Pal.leafDark);
  for (let fy = y + 8; fy < y + h - 8; fy += 8) {
    fill(g, x, fy, 4, 4, Pal.leaf);
    fill(g, x + w - 4, fy, 4, 4, Pal.leaf);
  }
  return addMark(scene, DOOR.x, y + Math.floor(h / 2), {
    size: Type.title,
    color: Color.creamHex,
    stroke: "#2a4a30",
    strokeThickness: 2,
    maxWidth: w - 48,
    maxHeight: h - 24,
  })
    .setOrigin(0.5)
    .setDepth(1);
}

function drawStaffDoor(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(4);
  drawDoor(g, BACK_DOOR.x, COUNTER_FRONT, BACK_DOOR_W, BACK_DOOR_H, "panel", COUNTER_TOP);
  return g;
}

export type ShopStaticBake = {
  /** Walls/floor/doors/mat — bake at depth 0. */
  background: Phaser.GameObjects.GameObject[];
  /** Counter/sill/tablet shell — bake at depth 7 (above people). */
  midground: Phaser.GameObjects.GameObject[];
};

export function drawShopInterior(scene: Phaser.Scene): ShopStaticBake {
  const g = scene.add.graphics();

  fill(g, 0, 0, GAME_WIDTH, COUNTER_FRONT, WALL);

  fill(g, 0, COUNTER_TOP - 110, GAME_WIDTH, COUNTER_FRONT - (COUNTER_TOP - 110), WAINSCOT);
  for (let x = 0; x < GAME_WIDTH; x += 48) fill(g, x, COUNTER_TOP - 110, PX, COUNTER_FRONT - (COUNTER_TOP - 110), WAINSCOT_LINE);
  fill(g, 0, CHAIR_RAIL_Y, GAME_WIDTH, CHAIR_RAIL_GREY_H, PAINT_EDGE);
  fill(g, 0, CHAIR_RAIL_Y + CHAIR_RAIL_GREY_H, GAME_WIDTH, CHAIR_RAIL_WHITE_H, PAINT_HI);

  fill(g, 0, 0, GAME_WIDTH, 28, 0x5a5c5c);
  fill(g, 0, 28, GAME_WIDTH, 4, 0x8a8c88);

  const pots = ceilingPots();
  for (const x of pots) potWallWash(g, x);
  for (const x of pots) potCan(g, x);

  for (let i = 0; i < TV_COUNT; i++) {
    const p = tvPos(i);
    tvBezel(g, p.x - TV_W / 2, p.y - TV_H / 2, TV_W, TV_H);
  }

  drawPassWindow(g);
  const sill = drawSillBench(scene);
  const charger = drawTabletCharger(scene);
  const tabletShell = drawTabletOnSill(scene);

  const winLeft = WINDOW.x - WINDOW.w / 2;
  const winTop = WINDOW_TOP;
  const winH = WINDOW.h;
  const reveal = 8;
  fill(g, winLeft - reveal, winTop - reveal, WINDOW.w + reveal * 2, winH + reveal, WIN_JAMB_DARK);
  fill(g, winLeft - reveal + 4, winTop - reveal + 4, WINDOW.w + reveal * 2 - 4, winH + reveal - 4, WIN_JAMB);
  fill(g, winLeft - reveal, winTop - reveal, WINDOW.w + reveal * 2, 8, WIN_JAMB_HI);
  fill(g, winLeft - reveal, winTop - reveal, WINDOW.w + reveal * 2, 4, WIN_PAINT_HI);
  fill(g, winLeft - reveal, winTop, 8, winH, WIN_JAMB_DARK);
  fill(g, winLeft + WINDOW.w, winTop, 8, winH, WIN_JAMB);

  drawDuskOutside(g, winLeft, winTop, WINDOW.w, winH, "moon");

  paintWindowSashAndRail(g);

  drawBoardFloor(g);
  for (const x of pots) potFloorPool(g, x);

  drawDoor(g, DOOR.x, COUNTER_FRONT, DOOR_W, DOOR_H, "glass");
  const doorHours = drawStreetDoorHours(scene);
  const matMark = drawKindlingMat(scene, g);

  const seatY = BENCH.y;
  const benchLeft = BENCH_LEFT;
  const benchW = BENCH_W;
  const benchH = COUNTER_FRONT - seatY;
  fill(g, benchLeft + 8, COUNTER_FRONT, benchW, 12, 0x1a1008, 0.5);
  fill(g, benchLeft - 12, seatY - 8, 12, benchH + 8, 0xc8c4bc);
  fill(g, benchLeft, seatY, benchW, benchH, 0xf2eee6);
  fill(g, benchLeft, seatY, 8, benchH, 0xd8d4cc);
  fill(g, benchLeft + benchW - 12, seatY, 12, benchH, 0xc8c4bc);
  for (let x = benchLeft + 20; x < benchLeft + benchW - 16; x += 20) {
    fill(g, x, seatY + 8, PX, benchH - 16, 0xd0ccc4);
  }
  fill(g, benchLeft, COUNTER_FRONT - 8, benchW, 8, 0xb8b4ac);
  fill(g, benchLeft, seatY - 24, benchW, 8, 0x2a1810, 0.45);
  fill(g, benchLeft - 4, seatY - 20, benchW + 4, 24, 0x0a0808);
  fill(g, benchLeft, seatY - 24, benchW - 8, 20, 0x141210);
  fill(g, benchLeft + 12, seatY - 28, benchW - 32, 8, 0x2a2826);
  fill(g, benchLeft + 24, seatY - 26, 48, 4, 0x3a3836);
  fill(g, benchLeft, seatY - 4, benchW, 8, 0x080604);

  const sillY = winTop + winH;
  const sillH = 12;
  fill(g, winLeft - 6, sillY + sillH, WINDOW.w + 12, 4, 0x1a1008, 0.25);
  fill(g, winLeft - 6, sillY, WINDOW.w + 12, sillH, WIN_PAINT);
  fill(g, winLeft - 6, sillY, WINDOW.w + 12, 4, WIN_PAINT_HI);
  fill(g, winLeft - 6, sillY + sillH - 4, WINDOW.w + 12, 4, WIN_PAINT_SHADE);

  const staffDoor = drawStaffDoor(scene);
  return {
    background: [g, staffDoor, matMark, ...doorHours],
    midground: [sill, charger, tabletShell],
  };
}

/** Half-widths (logical px) from leaflet base to tip — fat mid-blade, fine point. */
/** Half-widths (in PX) of a snake-plant blade, tip first, widest near the soil. */
const BLADE_PROFILE = [1, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2];

/**
 * One upright snake-plant blade rising from (baseX, baseY) to `height`, leaning by
 * `lean` px at the tip. Gold rims and a pale centre band keep blades readable.
 */
function uprightBlade(
  g: Phaser.GameObjects.Graphics,
  baseX: number,
  baseY: number,
  height: number,
  lean: number,
): void {
  const step = height / BLADE_PROFILE.length;
  BLADE_PROFILE.forEach((units, i) => {
    const half = units * PX;
    const t = 1 - i / BLADE_PROFILE.length;
    const x = baseX + lean * t;
    const y = baseY - height + step * i;
    fill(g, x - half - PX, y, (half + PX) * 2, step + PX, Pal.amber, 0.85);
    fill(g, x - half, y, half * 2, step + PX, Pal.leaf);
    fill(g, x - PX, y, PX * 2, step + PX, Color.leafBright, 0.35);
  });
}

/** Snake plant on the counter, left of the key lead. */
function drawCounterPlant(g: Phaser.GameObjects.Graphics, cx: number, footY: number): void {
  const rimW = 68;
  const rimH = 14;
  const potH = 44;
  const potTop = footY - potH;
  const rimTop = potTop - rimH;

  fill(g, cx - rimW / 2 + 8, footY - 4, rimW - 12, 8, 0x1a1008, 0.35);
  fill(g, cx - 30, potTop, 60, 14, Pal.rust);
  fill(g, cx - 28, potTop + 14, 56, 16, Pal.rust);
  fill(g, cx - 24, potTop + 30, 48, 14, Pal.rustDark);
  fill(g, cx - 28, potTop, 8, potH, Color.leafBright, 0.12);
  fill(g, cx + 16, potTop, 8, potH - 12, Pal.rustDark, 0.5);
  fill(g, cx - rimW / 2, rimTop, rimW, rimH, Pal.rust);
  fill(g, cx - rimW / 2, rimTop, rimW, 4, Pal.amber);
  fill(g, cx - rimW / 2 + 8, rimTop + rimH - 4, rimW - 16, 4, Pal.rustDark);
  fill(g, cx - 24, rimTop + 4, 48, 6, Pal.shadow);

  // Upright blades of mixed height straight out of the soil; no stem, no fan.
  const soil = rimTop + 6;
  uprightBlade(g, cx - 20, soil, 50, -6);
  uprightBlade(g, cx + 20, soil, 54, 6);
  uprightBlade(g, cx - 8, soil, 74, -3);
  uprightBlade(g, cx + 8, soil, 66, 4);
  uprightBlade(g, cx, soil, 84, 0);
}

export function drawShopCounter(scene: Phaser.Scene): {
  graphics: Phaser.GameObjects.Graphics;
  plaqueMark: Phaser.GameObjects.GameObject;
} {
  const g = scene.add.graphics().setDepth(7);
  const w = COUNTER_RIGHT - COUNTER_LEFT;
  const depth = 24;
  const topBack = COUNTER_TOP - depth;
  const grey = 0x8e9090;
  const greyLite = 0xa4a6a6;
  const greyEdge = 0x6e7070;
  const faceH = COUNTER_FRONT - COUNTER_TOP;

  fill(g, COUNTER_LEFT - 16, topBack + 8, 16, COUNTER_FRONT - (topBack + 8), PAINT_SHADE);

  fill(g, COUNTER_LEFT, COUNTER_TOP, w, faceH, PAINT);
  fill(g, COUNTER_LEFT, COUNTER_TOP, 88, faceH, 0x2a2218, 0.08);
  fill(g, COUNTER_RIGHT - 88, COUNTER_TOP, 88, faceH, 0x2a2218, 0.08);
  fill(g, COUNTER_LEFT, COUNTER_FRONT - COUNTER_FACE_SHADE_H, w, COUNTER_FACE_SHADE_H, 0x1a1410, 0.1);
  fill(g, COUNTER_LEFT, COUNTER_FRONT - 8, w, 8, PAINT_EDGE);

  fill(g, COUNTER_LEFT, topBack, w, depth, grey);
  fill(g, COUNTER_LEFT, topBack, w, 6, greyEdge);
  fill(g, COUNTER_LEFT, COUNTER_TOP - 8, w, 8, greyLite);

  fill(g, BAG_STACK.x - 24, BAG_STACK.y - 8, 48, 8, greyEdge);
  drawCounterPlant(g, COUNTER_PLANT.x, COUNTER_PLANT.y);

  // Shop sign under the key lead: leaf border around a white field, centred on them.
  const cx = COUNTER_SIGN.x;
  const plaqueH = COUNTER_SIGN.h;
  const plaqueW = COUNTER_SIGN.w;
  const plaqueBorder = 8;
  const plaqueLeft = cx - Math.floor(plaqueW / 2);
  const plaqueTop = COUNTER_SIGN.y - plaqueH / 2;
  fill(g, plaqueLeft, plaqueTop, plaqueW, plaqueH, Pal.leafDark);
  fill(g, plaqueLeft + 3, plaqueTop + 3, plaqueW - 6, plaqueH - 6, Pal.leaf);
  fill(g, plaqueLeft + plaqueBorder, plaqueTop + plaqueBorder, plaqueW - plaqueBorder * 2, plaqueH - plaqueBorder * 2, SIGN_WHITE);
  const plaqueMark = addMark(scene, cx, plaqueTop + Math.floor(plaqueH / 2), {
    size: "25px",
    color: Color.inkHex,
    maxWidth: plaqueW - 40,
    maxHeight: plaqueH - 16,
  })
    .setOrigin(0.5)
    .setDepth(8);

  return { graphics: g, plaqueMark };
}
