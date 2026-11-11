import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_BUBBLE_MAX_X,
  CUSTOMER_BUBBLE_MIN_X,
  CUSTOMER_SPEECH_GAP,
  CUSTOMER_SPEECH_H,
  CUSTOMER_SPEECH_MIN_W,
  CUSTOMER_SLOT_PITCH,
  CUSTOMER_SPOT,
  customerSlotX,
  customerSpeechCenterY,
  customerSpeechShows,
  layoutCustomerSpeech,
  PERSON_DISPLAY_MAX_H,
} from "../maps/shopT0";

const here = dirname(fileURLToPath(import.meta.url));
/** core.autocrlf is true here, so a checkout delivers CRLF — normalise before matching. */
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

const src = read("ShopScene.ts");
const placement = read("../ui/plaquePlacementPhaser.ts");

/**
 * Slice between two markers, throwing on a miss. A scan that quietly matches nothing is
 * the failure mode this repo has been bitten by, so every slice here has to land.
 */
function between(text: string, start: string, end: string, what: string): string {
  const from = text.indexOf(start);
  if (from === -1) throw new Error(`${what}: start marker not found: ${JSON.stringify(start)}`);
  const to = text.indexOf(end, from + start.length);
  if (to === -1) throw new Error(`${what}: end marker not found: ${JSON.stringify(end)}`);
  return text.slice(from, to);
}

describe("speech stays off the models it belongs to", () => {
  it("pins character speech above heads via plaque center, not beside torsos", () => {
    const above = between(placement, "export function speechPlaqueAboveHead(", "\n}", "speechPlaqueAboveHead");
    expect(above, "uses signYAbove for head clearance").toMatch(/signYAbove\(chip, headTopY, gap\)/);
    expect(above, "returns plaque center coords").toMatch(/return \{ x: centerX, y: hostY \+ mid\.midY \}/);
    expect(above, "does not walk the display tree").not.toMatch(/getBounds/);
    expect(src, "Shop imports speech placement helpers").toContain('from "../ui/plaquePlacementPhaser"');

    expect(src, "key-lead bubble centered above head band").toMatch(
      /keyLeadBubble = addSignText[\s\S]*?\.setOrigin\(0\.5, 0\.5\)/,
    );
    expect(src, "key-lead holding copy stays single-line with room to breathe").toMatch(
      /keyLeadBubble = addSignText[\s\S]*noWrap: true[\s\S]*padX: SHOP_SPEECH_PAD_X[\s\S]*inkPad: SHOP_SPEECH_INK_PAD[\s\S]*typeRoleBox\(660, "speech"\)/,
    );
    expect(src, "driver bubble uses the same wider speech pad and ink slack").toMatch(
      /driverBubble = addSignText[\s\S]*padX: SHOP_SPEECH_PAD_X[\s\S]*padY: SHOP_SPEECH_PAD_Y[\s\S]*inkPad: SHOP_SPEECH_INK_PAD/,
    );
    expect(src, "customer order speech opts into ink pad").toMatch(
      /bubble = addSignText[\s\S]*inkPad: SHOP_SPEECH_INK_PAD/,
    );
    expect(src, "speech refit restores ink pad without clamp-fit").toContain("refitShopSpeech");
    expect(src, "ShopScene does not call fitTypeToBox on speech").not.toContain("fitTypeToBox");
    expect(src, "driver bubble centered above head").toMatch(
      /driverBubble = addSignText[\s\S]*?\.setOrigin\(0\.5, 0\.5\)/,
    );
    expect(src, "Shop sync never calls getBounds").not.toMatch(/getBounds\(\)/);
  });

  it("dirty-guards key-lead and driver bubble setText and pins only on copy/visibility change", () => {
    const sync = between(src, "private sync(snap: SimSnapshot)", "const packNext", "shop sync");
    expect(sync, "key-lead text guarded and refit").toMatch(
      /const textDirty = this\.keyLeadBubble\.text !== callout[\s\S]*if \(textDirty\)[\s\S]*setText\(callout\)[\s\S]*refitShopSpeech\(this\.keyLeadBubble\)/,
    );
    expect(sync, "driver text guarded and refit").toMatch(
      /const driverTextDirty = this\.driverBubble\.text !== driverLine[\s\S]*if \(driverTextDirty\)[\s\S]*setText\(driverLine\)[\s\S]*refitShopSpeech\(this\.driverBubble\)/,
    );
    expect(sync, "no unconditional key-lead setText").not.toMatch(/keyLeadBubble[\s\S]*?\.setText\(callout \?\? ""\)/);
    expect(sync, "pin key-lead only when shown").toMatch(/if \(showKeyLeadBubble\)/);
    expect(sync, "pin driver only when shown").toMatch(/if \(showDriverBubble\)/);
    expect(sync, "key-lead pin uses live sprite head for band midpoint").toMatch(
      /keyLeadSpeechPlaqueAboveHead\([\s\S]*this\.keyLeadBubble,[\s\S]*this\.keyLead\.x,[\s\S]*modelHeadTop\(this\.keyLead\)/,
    );
    expect(sync, "driver pin uses standing head line on live sprite x").toMatch(
      /speechPlaqueAboveHead\([\s\S]*this\.driverBubble,[\s\S]*this\.driver\.x,[\s\S]*standingPersonHeadTop\(this\.driver\)/,
    );
    expect(sync, "tracks key-lead bubble visibility for re-pin").toContain("lastShowKeyLeadBubble");
    expect(sync, "tracks driver bubble visibility for re-pin").toContain("lastShowDriverBubble");
    expect(sync, "re-pins key-lead when plaque height changes").toContain("lastKeyLeadPanelH");
    expect(sync, "re-pins driver when plaque height changes").toContain("lastDriverPanelH");
    expect(src, "target callout uses plaque center").toMatch(
      /setSignPlaqueCenter\(this\.targetCallout, p\.x, p\.y - itemSlotH\(\) \/ 2 - 6\)/,
    );
  });

  it("draws lobby customers in front of the baked counter face", () => {
    const make = between(src, "private makeCustomerVisual(", "return { sprite, bubble, feedback", "makeCustomerVisual");
    expect(make, "customer sprite depth above counter RT (7)").toMatch(/\.setDepth\(8\)/);
    expect(make, "speech chips above the sprite").toMatch(/\.setDepth\(10\)/);
    const sync = between(src, "private syncCustomers(", "private makeHotspots(", "syncCustomers");
    expect(sync, "feet Y from measured displayHeight").toMatch(/customerFeetY\(sprite\.displayHeight\)/);
  });

  it("places customer order speech above settled speakers via layoutCustomerSpeech", () => {
    const sync = between(src, "private syncCustomers(", "private makeHotspots(", "syncCustomers");
    expect(sync, "uses overhead layout").toMatch(/layoutCustomerSpeech\(/);
    expect(sync, "gated while walking in").toMatch(/customerSpeechShows\(true\)/);
    expect(sync, "anchors on layout centre via pinShopSpeech").toMatch(/pinShopSpeech\(bubble, pin\.x, pin\.y\)/);
    expect(sync, "no side pin helpers").not.toMatch(/pinSideSpeech|setSignPlaqueEdge/);
  });

  it("stacks customer-specific feedback under the ask, not as a centre banner", () => {
    const sync = between(src, "private syncCustomers(", "private makeHotspots(", "syncCustomers");
    expect(sync, "reads feedback field").toMatch(/customer\.feedback/);
    expect(sync, "feedback chip on visual").toMatch(/feedback\.setText\(note\)/);
  });

  it("dirty-guards customer bubble setText, applyPersonTexture, and speech layout", () => {
    const sync = between(src, "private syncCustomers(", "private makeHotspots(", "syncCustomers");
    expect(sync, "layout keyed on order id + quantized x + plaque height").toContain("lastCustomerLayoutKey");
    expect(sync, "layout keyed on order id + quantized x + plaque height").toContain("Math.round(c.x)");
    expect(sync, "layout keyed on order id + quantized x + plaque height").toMatch(/Math\.round\(h\)/);
    expect(sync, "measures plaque before layoutCustomerSpeech").toMatch(/signPlaqueExtents\(visual\.bubble\)/);
    expect(sync, "bubble setText guarded and refit").toMatch(
      /if \(bubble\.text !== customer\.bubble\)[\s\S]*bubble\.setText[\s\S]*refitShopSpeech\(bubble\)/,
    );
    const make = between(src, "private makeCustomerVisual(", "return { sprite, bubble, feedback", "makeCustomerVisual");
    expect(make, "fixed speech token at build").toMatch(/typeRole: "speech"/);
    expect(make, "customer order stays single-line with wider pad").toMatch(
      /noWrap: true[\s\S]*padX: SHOP_SPEECH_PAD_X/,
    );
    expect(sync, "look guarded before applyPersonTexture").toMatch(
      /if \(visual\.look !== customer\.look\)[\s\S]*applyPersonTexture\(visual\.sprite, customer\.look\)/,
    );
    expect(sync, "pulse/tint only when focused").toMatch(/if \(focus\)[\s\S]*setTint\(Color\.flash\)/);
    expect(sync, "hide bubble with setVisible").toMatch(/bubble\.setVisible\(false\)/);
    expect(sync, "no unconditional applyPersonTexture in else branch").not.toMatch(
      /\} else \{\s*applyPersonTexture/,
    );
  });

  it("shop sync hot path never rebakes typekit or render scale", () => {
    const sync = between(src, "private sync(snap: SimSnapshot)", "const packNext", "shop sync");
    expect(sync).not.toContain("bakeStaticShop");
    expect(sync).not.toContain("applyRenderScale");
    expect(sync).not.toContain("refreshTypekit");
  });
});

describe("shop speech chip resolver", () => {
  it("runs resolveShopChips after customer sync with placeChip", () => {
    expect(src).toContain("resolveShopChips");
    expect(src).toContain("placeChip(placer");
    expect(src).toContain("pinShopSpeech");
  });

  it("anchors leadBubble above KEYLEAD slot head with headHang", () => {
    const resolve = between(src, "private resolveShopChips(", "\n  }", "resolveShopChips");
    expect(resolve, "lead preferred above live keyLead head on sprite x").toMatch(
      /keyLeadSpeechPlaqueAboveHead\([\s\S]*this\.keyLeadBubble,[\s\S]*this\.keyLead\.x,[\s\S]*modelHeadTop\(this\.keyLead\)/,
    );
    expect(resolve, "driver preferred via standingPersonHeadTop on live x").toMatch(
      /speechPlaqueAboveHead\([\s\S]*this\.driverBubble,[\s\S]*this\.driver\.x,[\s\S]*standingPersonHeadTop\(this\.driver\)/,
    );
    expect(resolve, "seeds HUD obstacles before shop chips land").toMatch(/prepareShopChipObstacles\(placer\)/);
    expect(resolve, "customer speech owned by syncCustomers — not re-placed in resolver").not.toMatch(
      /for \(const customer of ordered\)/,
    );
    expect(src, "customer speech pinned on sprite x with tallest hat head line").toMatch(
      /standingPersonHeadTop\(sprite\)/,
    );
    expect(resolve, "registers tablet, TVs, and people as dodge obstacles").toMatch(/placer\.register\([\s\S]*"tablet"/);
    expect(resolve, "registers tablet, TVs, and people as dodge obstacles").toContain("tvRowAabb");
    expect(resolve, "registers keyLead/driver bodies, not customer speech speakers").toContain("spriteBodyAabb");
    expect(resolve, "does not register customer bodies as speech blockers").not.toMatch(/customer-\$\{/);
    expect(resolve, "head-hang for speech chips").toMatch(
      /placeShopChip\([\s\S]*"leadBubble"[\s\S]*true,\s*\)/,
    );
    expect(src, "head-hung speech always pins in world space — no screen-space placeChip").toMatch(
      /if \(headHang\)[\s\S]*pinShopSpeech\(chip, preferredX, preferredY\)/,
    );
    expect(src, "capture seed deferred to first live shop frame").toContain("consumePendingCaptureSeed");
    expect(src, "world speech uses scrollFactor 1 like door prompt").toContain("setSignScrollFactor");
    expect(src, "settled customers fall back to above-head pin without layout").toMatch(
      /speechPlaqueAboveHead\(bubble, sprite\.x, standingPersonHeadTop\(sprite\)\)/,
    );
    expect(resolve, "does not chase live keyLead x with magic offset").not.toMatch(/this\.keyLead\.x - 168/);
  });
});

describe("overhead speech collision layout", () => {
  it("centres each customer's plaque above their head", () => {
    const alone = layoutCustomerSpeech([{ orderId: "a", x: customerSlotX(0) }]);
    expect(alone).toHaveLength(1);
    const headTop = CUSTOMER_SPOT.y - PERSON_DISPLAY_MAX_H;
    expect(alone[0]!.x).toBe(customerSlotX(0));
    expect(alone[0]!.y).toBe(customerSpeechCenterY(headTop, CUSTOMER_SPEECH_H));

    const tight = layoutCustomerSpeech([{ orderId: "b", x: customerSlotX(0), h: 52 }]);
    expect(tight[0]!.h).toBe(52);
    expect(tight[0]!.y).toBe(customerSpeechCenterY(headTop, 52));
    expect(tight[0]!.y).toBeGreaterThan(alone[0]!.y);

    const three = [0, 1, 2].map((slot) => ({ orderId: `c${slot}`, x: customerSlotX(slot) }));
    const boxes = layoutCustomerSpeech(three);
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap =
          a.x - a.w / 2 < b.x + b.w / 2 &&
          b.x - b.w / 2 < a.x + a.w / 2 &&
          a.y - a.h / 2 < b.y + b.h / 2 &&
          b.y - b.h / 2 < a.y + a.h / 2;
        expect(overlap, `chips ${a.orderId} and ${b.orderId}`).toBe(false);
      }
      expect(boxes[i]!.x - boxes[i]!.w / 2).toBeGreaterThanOrEqual(CUSTOMER_BUBBLE_MIN_X);
      expect(boxes[i]!.x + boxes[i]!.w / 2).toBeLessThanOrEqual(CUSTOMER_BUBBLE_MAX_X);
    }
  });

  it("holds speech until the owner has settled", () => {
    expect(customerSpeechShows(false)).toBe(false);
    expect(customerSpeechShows(true)).toBe(true);
    expect(customerSpeechShows(false, CUSTOMER_SLOT_PITCH)).toBe(false);
  });

  it("keeps chip height within the overhead stack budget", () => {
    expect(CUSTOMER_SPEECH_H).toBeGreaterThanOrEqual(48);
    expect(CUSTOMER_SPEECH_MIN_W).toBeGreaterThanOrEqual(100);
  });

  it("leaves daylight above heads", () => {
    expect(CUSTOMER_SPEECH_GAP).toBeGreaterThanOrEqual(14);
  });

  it("never drops a settled speaker when the plaque is taller than CUSTOMER_SPEECH_H", () => {
    const headTop = CUSTOMER_SPOT.y - PERSON_DISPLAY_MAX_H;
    const maxBottom = headTop - CUSTOMER_SPEECH_GAP;
    for (const h of [120, 180, 240]) {
      const boxes = layoutCustomerSpeech([{ orderId: `tall-${h}`, x: customerSlotX(0), h }]);
      expect(boxes, `panelH=${h}`).toHaveLength(1);
      expect(boxes[0]!.x).toBe(customerSlotX(0));
      expect(boxes[0]!.y + boxes[0]!.h / 2).toBeLessThanOrEqual(maxBottom + 0.01);
    }
  });
});

describe("menu board row labels", () => {
  it("places item copy on the optical-centre anchor", () => {
    const hotspots = between(src, "private makeHotspots(", "\n}\n", "makeHotspots");
    expect(hotspots).toContain("itemLabelPos(i)");
    expect(hotspots).toContain("itemPos(i)");
  });
});

describe("shop hot-path dirty guards", () => {
  it("indexes catalog once for TV fills and dirty-guards tablet Graphics", () => {
    expect(src).toContain("skuById");
    expect(src).toContain("this.skuById.get(skuId)");
    expect(src).not.toMatch(/catalog\.find\(\(s\) => s\.id === this\.jarSkus/);
    expect(src).toContain("lastTabletKey");
    expect(src).toContain("if (tabletKey !== this.lastTabletKey)");
  });

  it("never snapshots on pointerdown — tablet ticket id comes from sync", () => {
    expect(src).toContain("tabletTicketId");
    expect(src).toContain("this.tabletTicketId = snap.tabletTicket?.id");
    const pointerBlocks = src.match(/\.on\("pointerdown"[^)]*\)[^{]*\{[^}]+\}/g) ?? [];
    expect(pointerBlocks.length).toBeGreaterThan(0);
    for (const block of pointerBlocks) {
      expect(block, block).not.toContain("snapshot(");
    }
  });

  it("shop hotspot handlers stay dumb — no layout, bake, typekit, or budget on the click stack", () => {
    const handlers = between(src, "private wireShopTap(", "private makeHotspots(", "wireShopTap callers");
    expect(handlers).toContain("ackTap");
    expect(handlers).not.toMatch(/fitTypeToBox|bakeStaticShop|refreshTypekit|applyRenderScale/);
    const hotspots = between(src, "private makeHotspots(", "\n}\n", "makeHotspots");
    expect(hotspots).not.toMatch(/fitTypeToBox|bakeStaticShop|refreshTypekit|applyRenderScale/);
    const customerHit = between(src, "private makeCustomerVisual(", "wireHover(sprite);", "customer pointer");
    expect(customerHit).not.toMatch(/fitTypeToBox|bakeStaticShop|refreshTypekit|applyRenderScale/);
  });
});
