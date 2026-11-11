import { PERSON_HAT_H, PERSON_W } from "../art/peopleSize";
import { GAME_WIDTH } from "../sim/constants";

/** Shop cutaway at 1920×1080. Staff behind the counter; lobby in front. */
export const FLOOR_Y = 860;
/**
 * Counter dropped further after speech moved aside — reclaim the old overhead speech
 * band (~50px) so the wall / counter-and-up band can grow. Customers stay fully visible
 * below the counter front (see CUSTOMER_HEAD_CLEAR).
 */
export const COUNTER_TOP = 750;
export const COUNTER_FRONT = 860;
/** Original slab 256–1504; left was pushed right 15% to widen the door bay. */
const SCREEN_5 = Math.round(GAME_WIDTH * 0.05);
const COUNTER_LEFT_WIDE = 256 + Math.round((1504 - 256) * 0.15);
const COUNTER_LEFT_PREV = Math.round(COUNTER_LEFT_WIDE * 0.9);
const COUNTER_RIGHT_PREV = 1504 - SCREEN_5;
/** Previous 399–1408 slab, grown 5% of the screen on each end. */
export const COUNTER_LEFT = COUNTER_LEFT_PREV - SCREEN_5;
export const COUNTER_RIGHT = COUNTER_RIGHT_PREV + SCREEN_5;
export const COUNTER_MID = Math.floor((COUNTER_LEFT + COUNTER_RIGHT) / 2);

/**
 * Standing people bake at 192×352. Scale fits the lobby under the
 * counter; another 15% up so the models fill the shirt and hat marks.
 */
export const PERSON_NATIVE_H = 352;
export const PEOPLE_SCALE = 0.873;
export const BAG_SCALE = 0.7;
export const PERSON_DISPLAY_H = Math.round(PERSON_NATIVE_H * PEOPLE_SCALE);
/** Tallest standing frame (hats) at {@link PEOPLE_SCALE} — use for head-clearance math. */
export const PERSON_DISPLAY_MAX_H = Math.round(PERSON_HAT_H * PEOPLE_SCALE);

/** Shirt mark sits above the laminate; head stays under the TVs. */
export const KEYLEAD = { x: COUNTER_MID, y: COUNTER_TOP + 78 };

/** Head top when the key lead stands at {@link KEYLEAD} (bottom-anchored, tallest hat frame). */
export function keyLeadSlotHeadTop(): number {
  return KEYLEAD.y - PERSON_DISPLAY_MAX_H;
}

const COUNTER_SIGN_H = 64;
/** Shade band + painted edge along the bottom of the counter face. */
export const COUNTER_FACE_SHADE_H = 28;
/**
 * Shop sign on the counter face, centred under the key lead — and centred in the
 * clean face above the bottom shade band, not in the full face. `y` is its middle.
 * The HUD score and clock hang off this box, so the whole group rides together.
 */
export const COUNTER_SIGN = {
  x: KEYLEAD.x,
  y: COUNTER_TOP + Math.floor((COUNTER_FRONT - COUNTER_FACE_SHADE_H - COUNTER_TOP) / 2),
  w: 320,
  h: COUNTER_SIGN_H,
};

export const BACK_DOOR_W = 200;
export const BACK_DOOR_H = 372;
export const BACK_DOOR = { x: 400 + (COUNTER_LEFT - 256), y: KEYLEAD.y };
/** Bag supply on the key-lead's right; the planter balances it on their left. */
export const BAG_STACK = { x: KEYLEAD.x + 190, y: COUNTER_TOP };
export const COUNTER_PLANT = { x: KEYLEAD.x - 220, y: COUNTER_TOP };
/** Where slips print. The receipt rail hangs off the counter under this spot. */
export const RECEIPT_SPOT = { x: COUNTER_RIGHT - 48, y: COUNTER_TOP };
/**
 * Counter bags print their label on their own face, so they bake and draw 1:1
 * (see `counterBag` in pixelArt). Grown taller so the supply / ready bags
 * visually overlap the ORDERS tablet a little; width stays put so the hit
 * targets and label panels keep their horizontal room.
 */
export const COUNTER_BAG_W = 112;
export const COUNTER_BAG_H = 136;
/**
 * The printed panel on a counter bag's face, as offsets from the sprite's
 * bottom-centre origin. The live count owns the upper band; the baked
 * DELIVERY / PICKUP word owns the shorter band beneath it. Panel sits near the
 * bag mouth (top of the taller kraft face).
 */
export const BAG_PANEL = { w: 80, countCy: -95, countH: 34 };

/** Packed deliveries pile at the counter's right end; pickups tuck in behind. */
export const READY_BAG = { x: COUNTER_RIGHT - 248, y: COUNTER_TOP };
export const PICKUP_BAG = { x: READY_BAG.x + 104, y: COUNTER_TOP };

/**
 * Receipts clipped to the counter face under the slip spot: one row per packed
 * bag, oldest at the top. The left edge has to clear the HUD clock readout.
 */
export const RECEIPT_RAIL = {
  right: RECEIPT_SPOT.x + 32,
  top: COUNTER_TOP + 2,
  w: 252,
  pad: 4,
  rowH: 18,
  maxRows: 6,
  /** Row text starts right of the pickup / delivery accent tab. */
  inset: 22,
};

export function receiptRailBox(rowCount: number): { left: number; top: number; w: number; h: number } {
  return {
    left: RECEIPT_RAIL.right - RECEIPT_RAIL.w,
    top: RECEIPT_RAIL.top,
    w: RECEIPT_RAIL.w,
    h: RECEIPT_RAIL.pad * 2 + Math.max(1, rowCount) * RECEIPT_RAIL.rowH,
  };
}

/** Middle of row `index`, counting from the oldest slip at the top. */
export function receiptRowY(index: number): number {
  return RECEIPT_RAIL.top + RECEIPT_RAIL.pad + index * RECEIPT_RAIL.rowH + RECEIPT_RAIL.rowH / 2;
}

export const BENCH_INSET = 0;
export const BENCH_LEFT = COUNTER_RIGHT;
export const BENCH_W = GAME_WIDTH - BENCH_INSET - BENCH_LEFT;
export const BENCH = {
  x: BENCH_LEFT + Math.floor(BENCH_W / 2),
  y: COUNTER_TOP + Math.floor((COUNTER_FRONT - COUNTER_TOP) / 2),
};
/**
 * Order-announcement chip size (~+25% message scale). Plaques sit above settled
 * customers' heads once they reach the counter.
 */
export const CUSTOMER_SPEECH_H = 83;
/** Daylight between stacked speech / feedback chips, and above a model's head when hanging. */
export const CUSTOMER_SPEECH_GAP = 14;
/** Edge clearance in the head↔TV band when centering the key-lead holding plaque. */
export const SHOP_KEY_LEAD_SPEECH_GAP = 14;
/**
 * Pull the key-lead holding plaque toward the live hat after band midpoint — 0 is pure
 * center, 1 sits on the head-adjacent max. Tune for even visual air vs sprites.
 */
export const SHOP_KEY_LEAD_BAND_HEAD_BIAS = 0.35;
/** @deprecated Side chips removed — kept for width math in legacy callers. */
export const CUSTOMER_SPEECH_SIDE_GAP = 12;
/** Hair sits this far below the counter front so heads stay fully visible. */
export const CUSTOMER_HEAD_CLEAR = 12;
/**
 * @deprecated Overhead band removed — alias of the head-clear line for migrating callers.
 * Prefer {@link CUSTOMER_HEAD_CLEAR}.
 */
export const CUSTOMER_SPEECH_BASE = COUNTER_FRONT + CUSTOMER_HEAD_CLEAR;

/** Feet Y for a bottom-anchored customer so head top sits on the clear line. */
export function customerFeetY(displayHeight: number): number {
  return COUNTER_FRONT + CUSTOMER_HEAD_CLEAR + displayHeight;
}

/** Feet on the lobby boards when the sprite is as tall as a hat frame. */
export const CUSTOMER_SPOT = {
  x: COUNTER_MID,
  y: customerFeetY(PERSON_DISPLAY_MAX_H),
};
/** Bubbles must clear the lobby sandwich board on the far left. */
export const CUSTOMER_BUBBLE_MIN_X = 300;
/** Bubbles must clear the settings cog column on the far right. */
export const CUSTOMER_BUBBLE_MAX_X = GAME_WIDTH - 120;

export const DOOR_W = 200;
export const DOOR_H = 372;
/** Street door sat in the old bay; shifted left 5%, then nudged back toward the counter. */
export const DOOR = {
  x: Math.floor(DOOR_W / 2 + (COUNTER_LEFT_PREV - DOOR_W) / 2) - SCREEN_5 + 36,
  y: CUSTOMER_SPOT.y,
};

/**
 * Standing room per customer. People bake 192 wide and draw at {@link PEOPLE_SCALE},
 * so this is the shoulder-to-shoulder figure plus a hand's width of daylight — the
 * pitch below cannot go under it without sprites touching.
 */
export const PERSON_DISPLAY_W = Math.round(PERSON_W * PEOPLE_SCALE);
export const CUSTOMER_SLOT_PITCH = PERSON_DISPLAY_W + 16;

/**
 * Where the `index`-th customer on the floor stands: the first arrival takes the counter
 * spot and the rest queue back toward the street door they came in through.
 *
 * The line runs doorward rather than fanning out either side of the counter, because
 * every slot then sits on the way in. A customer's walk is at most the one to the
 * counter spot and usually shorter, so nobody now waits longer to be served than they
 * did when the whole floor stood on one spot — which matters: the NPC key lead's cover
 * loop only starts on a customer once they have stopped walking, and the shift's timing
 * is tuned against that.
 */
export function customerSlotX(index: number): number {
  return CUSTOMER_SPOT.x - index * CUSTOMER_SLOT_PITCH;
}

/** Daylight left between one chip and the next. */
export const CUSTOMER_SPEECH_PAD = 8;
/** Widest a chip draws when the floor is quiet enough to give it the room (~+25%). */
export const CUSTOMER_SPEECH_MAX_W = 560;
/** Narrowest side chip when neighbours leave little room (~+25%). */
export const CUSTOMER_SPEECH_MIN_W = 150;

export type CustomerSpeechSide = "left" | "right";

export interface CustomerSpeechBox {
  orderId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  side: CustomerSpeechSide;
}

/**
 * How wide a side chip may draw given free horizontal room on its chosen side.
 */
export function customerSpeechWidth(sideRoom: number): number {
  if (!Number.isFinite(sideRoom)) return CUSTOMER_SPEECH_MAX_W;
  return Math.max(CUSTOMER_SPEECH_MIN_W, Math.min(CUSTOMER_SPEECH_MAX_W, sideRoom));
}

/**
 * Side chips only show once the customer has settled — walking-in chips would jump every
 * frame as x changes, and they would collide with everyone they pass.
 */
export function customerSpeechShows(settled: boolean, _nearestGap?: number): boolean {
  return settled;
}

/** Horizontal room on `side` of a customer before hitting a screen / chrome bound. */
export function customerSideRoom(customerX: number, side: CustomerSpeechSide): number {
  const body = PERSON_DISPLAY_W / 2;
  if (side === "right") {
    return CUSTOMER_BUBBLE_MAX_X - (customerX + body + CUSTOMER_SPEECH_SIDE_GAP);
  }
  return customerX - body - CUSTOMER_SPEECH_SIDE_GAP - CUSTOMER_BUBBLE_MIN_X;
}

function chipCentreX(customerX: number, side: CustomerSpeechSide, bubbleW: number): number {
  const body = PERSON_DISPLAY_W / 2;
  if (side === "right") {
    return customerX + body + CUSTOMER_SPEECH_SIDE_GAP + bubbleW / 2;
  }
  return customerX - body - CUSTOMER_SPEECH_SIDE_GAP - bubbleW / 2;
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x - a.w / 2 < b.x + b.w / 2 &&
    b.x - b.w / 2 < a.x + a.w / 2 &&
    a.y - a.h / 2 < b.y + b.h / 2 &&
    b.y - b.h / 2 < a.y + a.h / 2
  );
}

/** Plaque center Y for speech hung above a standing customer's head. */
export function customerSpeechCenterY(
  headTopY: number,
  bubbleH: number = CUSTOMER_SPEECH_H,
): number {
  return headTopY - CUSTOMER_SPEECH_GAP - bubbleH / 2;
}

/**
 * Place settled customers' order speech above their heads. Callers pass customers
 * front-of-queue first; when plaques overlap, later speakers stack upward.
 */
export function layoutCustomerSpeech(
  customers: readonly { orderId: string; x: number; h?: number }[],
  defaultBubbleH: number = CUSTOMER_SPEECH_H,
): CustomerSpeechBox[] {
  const placed: CustomerSpeechBox[] = [];
  const headTop = CUSTOMER_SPOT.y - PERSON_DISPLAY_MAX_H;
  for (const customer of customers) {
    const bubbleH = customer.h ?? defaultBubbleH;
    const halfRoom = Math.min(
      customer.x - CUSTOMER_BUBBLE_MIN_X,
      CUSTOMER_BUBBLE_MAX_X - customer.x,
    );
    if (halfRoom < CUSTOMER_SPEECH_MIN_W / 2) continue;
    const w = customerSpeechWidth(halfRoom * 2);
    const x = customer.x;
    let y = customerSpeechCenterY(headTop, bubbleH);
    const box: CustomerSpeechBox = {
      orderId: customer.orderId,
      x,
      y,
      w,
      h: bubbleH,
      side: "right",
    };
    let guard = 0;
    while (placed.some((other) => rectsOverlap(box, other)) && guard++ < 12) {
      y -= bubbleH + CUSTOMER_SPEECH_PAD;
      box.y = y;
    }
    // Tall plaques: snap bottom to the head-clearance line, then stack up if neighbours overlap.
    const maxBottom = headTop - CUSTOMER_SPEECH_GAP;
    if (box.y + box.h / 2 > maxBottom) {
      y = maxBottom - bubbleH / 2;
      box.y = y;
      guard = 0;
      while (placed.some((other) => rectsOverlap(box, other)) && guard++ < 12) {
        y -= bubbleH + CUSTOMER_SPEECH_PAD;
        box.y = y;
      }
    }
    placed.push(box);
  }
  return placed;
}

export const TV_COUNT = 3;
export const TV_COLS = 3;
export const ITEMS_PER_TV = 3;
/**
 * Counter-and-up growth after the speech-band reclaim: TVs enlarge with the rest of the
 * wall band (not TV-only). Full scale (no 0.95 trim) so each item row gets a taller hit.
 */
const TV_BASE_W = 304;
const TV_BASE_H = 220;
const TV_BASE_TOP = 140;
const TV_SCALE = 1.24;
export const TV_W = Math.round(TV_BASE_W * TV_SCALE);
export const TV_H = Math.round(TV_BASE_H * TV_SCALE);
/** Chassis-to-chassis wall; ~32px of plaster shows after the 4px sit-on-wall reveal. */
export const TV_GAP_X = 40;
export const TV_GAP_Y = 0;
/** Dark bezel / recessed-glass inset. Keep item slots inside this. */
export const TV_BEZEL = Math.round(16 * TV_SCALE);
export const TV_GRID_W = TV_COLS * TV_W + (TV_COLS - 1) * TV_GAP_X;
export const CEILING_POT_LEFT = 150;
export const CEILING_POT_RIGHT = 1760;
/** Menu TVs centered over the key-lead. */
export const TV_GRID_MID = KEYLEAD.x;
export const TV_GRID_LEFT = Math.floor(TV_GRID_MID - TV_GRID_W / 2);
/** Keep the bank on the wall under the cans; taller TV_H lifts the top (bottom stays). */
export const TV_GRID_TOP = TV_BASE_TOP + TV_BASE_H - TV_H;
/** tvBezel mount rail below the TV chassis (PX + PX×2 in shopInterior). */
export const TV_MOUNT_DROP = 12;
/** Visible TV bottom for key-lead band math — chassis plus mount rail. */
export const TV_VISIBLE_BOTTOM = TV_GRID_TOP + TV_H + TV_MOUNT_DROP;

/** Grey-over-white chair rail; the pass-through oak sill sits on this band. */
export const CHAIR_RAIL_Y = COUNTER_TOP - 114;
export const CHAIR_RAIL_GREY_H = 8;
export const CHAIR_RAIL_WHITE_H = 8;
export const CHAIR_RAIL_H = CHAIR_RAIL_GREY_H + CHAIR_RAIL_WHITE_H;

/** Shared lintel for the pass-through and driver windows, under the TVs. */
export const WINDOW_TOP = TV_GRID_TOP + TV_H + 40;
/** Keep the street-window bottom clear of the driver pillow. */
export const WINDOW_CLEAR = 48;
/** Wall between the pass-through / counter corner and the delivery glass. */
export const WINDOW_LEFT_INSET = 24;
export const WINDOW_RIGHT_INSET = 76;
const WINDOW_BASE_W = GAME_WIDTH - BENCH_LEFT - WINDOW_LEFT_INSET - WINDOW_RIGHT_INSET;
const WINDOW_BASE_MID = BENCH_LEFT + WINDOW_LEFT_INSET + Math.floor(WINDOW_BASE_W / 2);
/** 2% wider for easier driver taps on mobile. */
const WINDOW_TAP_W = Math.round(WINDOW_BASE_W * 1.02);
/** Another 5% of glass, added to the right edge only — left jamb stays put. */
const WINDOW_RIGHT_GROW = Math.round(WINDOW_TAP_W * 0.05);
/** A further 5%, right edge again. Even px so the left jamb keeps its whole-pixel column. */
const WINDOW_RIGHT_GROW_2 = 2 * Math.round(((WINDOW_TAP_W + WINDOW_RIGHT_GROW) * 0.05) / 2);
/** All right-side growth so far; `x` shifts by half of it so only the right edge moves. */
const WINDOW_RIGHT_TOTAL = WINDOW_RIGHT_GROW + WINDOW_RIGHT_GROW_2;
export const WINDOW = {
  x: WINDOW_BASE_MID + Math.round(WINDOW_RIGHT_TOTAL / 2),
  w: WINDOW_TAP_W + WINDOW_RIGHT_TOTAL,
  h: BENCH.y - WINDOW_CLEAR - WINDOW_TOP,
};
/** Driver keeps their original spot; only the glass grew. */
export const DRIVER = { x: WINDOW_BASE_MID, y: BENCH.y + 48 };

export const TABLET_W = 190;
export const TABLET_H = 122;
export const TABLET_HEADER_H = 16;
export const TABLET_HOME_H = 0;
/** Oak shelf flush with the chair rail. */
export const SILL_H = CHAIR_RAIL_H + 2;
export const SILL_Y = CHAIR_RAIL_Y;
/**
 * Pass-through into the product room. Opening sits under the TVs with a
 * wider gap from the key-lead, and stops at the oak sill so stock only
 * shows in the window.
 */
export const PASS_WINDOW = {
  x: KEYLEAD.x + 360,
  y: WINDOW_TOP,
  w: 400,
  h: SILL_Y - WINDOW_TOP,
};
/** Landscape iPad sitting on the product-room sill. */
export const TABLET = {
  x: PASS_WINDOW.x,
  y: SILL_Y + 2 - TABLET_H / 2,
};

export function tabletLayout() {
  const left = TABLET.x - TABLET_W / 2;
  const top = TABLET.y - TABLET_H / 2;
  const side = 16;
  const cap = 8;
  return {
    left,
    top,
    w: TABLET_W,
    h: TABLET_H,
    screenLeft: left + side,
    screenTop: top + cap,
    screenW: TABLET_W - side * 2,
    screenH: TABLET_H - cap * 2,
    headerH: TABLET_HEADER_H,
    homeH: TABLET_HOME_H,
  };
}

export function tvPos(index: number): { x: number; y: number } {
  const col = index % TV_COLS;
  const row = Math.floor(index / TV_COLS);
  return {
    x: TV_GRID_LEFT + TV_W / 2 + col * (TV_W + TV_GAP_X),
    y: TV_GRID_TOP + TV_H / 2 + row * (TV_H + TV_GAP_Y),
  };
}

export function itemSlotH(): number {
  return Math.floor((TV_H - TV_BEZEL * 2) / ITEMS_PER_TV);
}

export function itemPos(index: number): { x: number; y: number } {
  const tv = Math.floor(index / ITEMS_PER_TV);
  const slot = index % ITEMS_PER_TV;
  const p = tvPos(tv);
  const slotH = itemSlotH();
  const blockTop = p.y - TV_H / 2 + TV_BEZEL;
  return { x: p.x, y: blockTop + slot * slotH + slotH / 2 };
}

/**
 * Menu-row label anchor — {@link itemPos} plus a small downward nudge so cap-height
 * type reads centred inside each coloured item slot (centre origin sits visually high).
 */
export const ITEM_LABEL_OPTICAL_Y = 3;

export function itemLabelPos(index: number): { x: number; y: number } {
  const p = itemPos(index);
  return { x: p.x, y: p.y + ITEM_LABEL_OPTICAL_Y };
}

/** Five cans, even gaps across the ceiling band. Not locked to TV centers. */
export function ceilingPots(): number[] {
  const n = 5;
  const span = CEILING_POT_RIGHT - CEILING_POT_LEFT;
  return Array.from({ length: n }, (_, i) => Math.round(CEILING_POT_LEFT + (span * i) / (n - 1)));
}
