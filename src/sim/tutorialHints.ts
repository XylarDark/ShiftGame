import type { SimSnapshot } from "./gameSim";

export type TutorialHint =
  | { id: string; kind: "item"; skuId: string }
  | { id: string; kind: "bagRack" }
  | { id: string; kind: "tablet"; orderId: string }
  | { id: string; kind: "customer"; orderId: string }
  | { id: string; kind: "hitTheRoad" }
  | { id: string; kind: "handoff" }
  | { id: string; kind: "phone" }
  | { id: string; kind: "idCard" }
  | { id: string; kind: "gpsPin" }
  | { id: string; kind: "doorCustomer" }
  | { id: string; kind: "shop" };

/** Exactly one next tap — flashing UI marks it; never pack and HIT THE ROAD at once. */
export function tutorialHints(snap: SimSnapshot): TutorialHint[] {
  const next = snap.playerRole === "driver" ? nextDriverHint(snap) : nextShopHint(snap);
  return next ? [next] : [];
}

/** The single shop click the player should take next. */
export function nextShopHint(snap: SimSnapshot): TutorialHint | null {
  const busy = snap.keyLead.phase !== "idle";

  const walkIn = snap.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
  const walkInAtCounter =
    walkIn &&
    snap.customers.some((c) => c.orderId === walkIn.id && c.bubble !== "Coming in…" && c.bubble !== "On the way…");
  if (walkIn && walkInAtCounter && !busy) {
    if (snap.handSkuId === walkIn.skuId) {
      return { id: `customer:${walkIn.id}`, kind: "customer", orderId: walkIn.id };
    }
    return { id: `item:${walkIn.skuId}`, kind: "item", skuId: walkIn.skuId };
  }

  if (busy) return null;

  if (snap.awaitingBag) {
    return { id: "bagRack", kind: "bagRack" };
  }

  if (snap.highlightSkuId) {
    return { id: `item:${snap.highlightSkuId}`, kind: "item", skuId: snap.highlightSkuId };
  }

  const pickup = snap.orders.find((o) => o.type === "pickup" && o.status === "readyForHandoff");
  const pickupAtCounter =
    pickup &&
    snap.customers.some((c) => c.orderId === pickup.id && c.bubble === "Tap me — pickup");
  if (pickup && pickupAtCounter) {
    return { id: `customer:${pickup.id}`, kind: "customer", orderId: pickup.id };
  }

  if (snap.tabletTicket?.status === "queued") {
    return { id: `tablet:${snap.tabletTicket.id}`, kind: "tablet", orderId: snap.tabletTicket.id };
  }

  if (snap.canHitTheRoad) {
    return { id: "hitTheRoad", kind: "hitTheRoad" };
  }

  return null;
}

function nextDriverHint(snap: SimSnapshot): TutorialHint | null {
  const drop = snap.dropoff;
  if (drop.phase === "atCurb" || drop.actionLabel === "CALL") {
    return { id: "phone", kind: "phone" };
  }
  if (drop.phase === "calling") return null;
  if (drop.actionLabel === "ASK ID") {
    return { id: "askId", kind: "doorCustomer" };
  }
  if (drop.actionLabel === "CHECK ID" || drop.idCard) {
    return { id: "idCard", kind: "idCard" };
  }
  if (drop.actionLabel === "HAND BAG" || drop.actionLabel === "PHOTO") {
    return { id: "handoff", kind: "handoff" };
  }
  if (snap.run?.nextStopId) return { id: "gpsPin", kind: "gpsPin" };
  if (snap.autoDriving) return null;
  return { id: "shop", kind: "shop" };
}
