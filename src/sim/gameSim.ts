import {
  backAtShopBagsToast,
  backAtShopToast,
  brand,
  deniedNextStopToast,
  deniedReturnToShopToast,
  driveToShopFirstToast,
  dropNextStopToast,
  dropReturnToShopToast,
  headBackToShopHint,
  headBackToShopToast,
  parkedAtShopToast,
} from "../ui/brand";
import { createCatalog, skuById, type Sku } from "./catalog";
import { formatGameClock, GameClock } from "./clock";
import {
  CALL_CONNECT_MS,
  CUSTOMER_SPEED,
  HANDOFF_RADIUS,
  PARK_ARRIVE_RADIUS,
  INSTORE_WALKOUT_MS,
  NPC_INTERACT_COOLDOWN_MS,
  KEYLEAD_WALK_SPEED,
  BACKROOM_MS,
  TABLET_QUEUE_MAX,
  TICKET_WAVE_MAX_MS,
  TICKET_WAVE_MIN_MS,
  FIRST_TICKET_WAVE_MS,
  WALKIN_GAP_MIN_MS,
  WALKIN_GAP_MAX_MS,
  FIRST_WALKIN_MS,
  COVER_NOTICE_STEP_MS,
  COVER_NOTICE_MAX_STEPS,
  COVER_LOSS_LINE_MS,
  OPENING_FIRST_AT_MS,
  OPENING_ORDER_GAP_MS,
  MS_PER_GAME_HOUR,
  PICKUP_ARRIVE_MS,
  PICKUP_HANDOFF_WAIT_MS,
  SCORE_DELIVERY_LATE,
  SCORE_DELIVERY_ON_TIME,
  SCORE_FAIL,
  SHIFT_MS,
  PARK_TURN_RATE,
  VEHICLE_SPEED,
} from "./constants";
import { customerLookIndex } from "../art/people";
import {
  dropoffGateAccepts,
  latchDropoffGate,
  tickDropoffGate,
  type DropoffConfirmGate,
} from "./dropoffConfirm";
import { ageForSeed, emptyDropoff, idCardFor, idMatchesForSeed, type DropoffPhase, type DropoffView } from "./dropoff";
import { destLabel, isOpen, needsFetch, tabletQueue, type Order, type OrderType } from "./orders";
import {
  advanceRoute,
  angleDelta,
  approachToStall,
  kerbParkHeading,
  lerpAngle,
  normalizeAngle,
  stallRestHeading,
  routeWorldPoints,
  snapPathToDriveLanes,
  type StallApproach,
  type WorldPoint,
} from "./driveRoute";
import { findPath } from "./pathfinding";
import { generateCustomerName } from "./names";
import { isDeliveryLate, scoreForComplete, scoreForFail } from "./scoring";
import { buildShiftResults, type ShiftResults } from "./shiftResults";
import type { SfxKind } from "../audio/sfx";
import {
  CITY,
  doorstepWorld,
  houseById,
  houseTitle,
  MAP_PX_H,
  MAP_PX_W,
  TILE,
  tileToWorld,
  worldToTile,
  type HouseStop,
} from "../maps/cityT0";
import { cityTrafficLoops, driveSpeedForTraffic, trafficCars, type TrafficCarView } from "../maps/traffic";
import { BACK_DOOR, CUSTOMER_SPOT, customerSlotX, DOOR, KEYLEAD, PERSON_DISPLAY_MAX_H } from "../maps/shopT0";

export type PlayerRole = "keyLead" | "driver";

export type ShopClick =
  | { type: "keyLead" }
  | { type: "bagRack" }
  | { type: "item"; skuId: string }
  | { type: "tablet"; orderId: string }
  | { type: "handoff" }
  | { type: "customer"; orderId: string };

export type KeyLeadPhase = "idle" | "toBack" | "inBack" | "fromBack";

export interface KeyLeadView {
  x: number;
  y: number;
  facing: number;
  phase: KeyLeadPhase;
  visible: boolean;
}

/** World-space anchor for a floating score delta — HudScene projects through the live camera. */
export type ScorePopSpace = "shop" | "drive" | "door";

export interface ScorePopAnchor {
  x: number;
  y: number;
  space: ScorePopSpace;
}

export interface ScoreFlash {
  id: number;
  delta: number;
  anchor: ScorePopAnchor;
}

export interface CustomerView {
  orderId: string;
  x: number;
  bubble: string;
  /**
   * Customer-specific feedback that used to live in the bottom toast (Wrong TV that names
   * their ask, still-walking, etc.). Rendered in that customer's side stack.
   */
  feedback: string | null;
  kind: "inStore" | "pickup";
  /** Which standing slot they hold — see `customerSlotX`. The scene places speech off it. */
  slot: number;
  /** Index into the customer appearance pool — stable for the life of the order. */
  look: number;
}

export interface OrderView {
  id: string;
  type: OrderType;
  skuId: string;
  skuName: string;
  customerName: string;
  status: Order["status"];
  destinationId?: string;
  destLabel: string;
  slaRemainingMs: number | null;
  /** Ticket age — the receipt rail stacks packed bags oldest-first. */
  createdAtGameMs: number;
  late: boolean;
}

export interface DeliveryRun {
  orderIds: string[];
  nextStopId: string | null;
}

/** What the key lead is holding down at the counter while the van is out. */
export interface ShopCoverView {
  /** True whenever the player is driving and the key lead is minding the shop alone. */
  active: boolean;
  /** One line naming the job the key lead has in their hands right now. */
  line: string;
  /** Walk-ins and pickup customers still owed a bag. */
  waiting: number;
  /** Delivery bags packed and parked for the driver's next run. */
  packed: number;
  /** Counter sales the key lead has closed since the van left. */
  served: number;
  /** Counter orders lost since the van left. */
  lost: number;
}

export interface SimSnapshot {
  gameMs: number;
  clockLabel: string;
  score: number;
  playerRole: PlayerRole;
  catalog: Sku[];
  handSkuId: string | null;
  handSkuName: string | null;
  selectedOrderId: string | null;
  awaitingBag: boolean;
  keyLead: KeyLeadView;
  vehicle: { x: number; y: number; heading: number };
  autoDriving: boolean;
  customers: CustomerView[];
  orders: OrderView[];
  bagsOnPickup: string[];
  bagsInBin: string[];
  run: DeliveryRun | null;
  shopCover: ShopCoverView;
  dropoff: DropoffView;
  toast: string;
  /** Light spawn / ticket notice on the ORDERS tablet (shop). */
  ordersNotice: string | null;
  /** Wrong-TV / item callout anchored near that item slot. */
  targetCallout: { skuId: string; text: string } | null;
  serveLine: string;
  highlightSkuId: string | null;
  canHitTheRoad: boolean;
  tabletTicket: OrderView | null;
  tabletQueueCount: number;
  /** After tapping a ticket: "Pickup: [item] for [customer]". */
  keyLeadLine: string | null;
  /** After tapping a delivery: "Ok, off I go." */
  driverLine: string | null;
  /** True after 23:00 or End shift — results UI owns the session. */
  shiftEnded: boolean;
  shiftResults: ShiftResults | null;
  /** Settings: End shift early after ≥1 scored complete/fail. */
  canEndShiftEarly: boolean;
  /** Latest score delta for HUD pops; id increments each event. */
  scoreFlash: ScoreFlash | null;
  /** One-shot UI sound cue for HudScene. */
  sfxCue: { id: number; kind: SfxKind } | null;
}

export interface SimOptions {
  seed?: number;
  autoSpawn?: boolean;
}

interface CustomerState {
  orderId: string;
  x: number;
  targetX: number;
  kind: "inStore" | "pickup";
  /** Standing position on the floor, held for the customer's whole visit. */
  slot: number;
}

interface SpawnEvent {
  atMs: number;
  type: OrderType;
  destinationId?: string;
}

interface DropoffState {
  orderId: string;
  houseId: string;
  phase: DropoffPhase;
  callDoneAt?: number;
  customer: { x: number; y: number; targetX: number; targetY: number } | null;
  driver: { x: number; y: number } | null;
  photoTaken: boolean;
  idAsked: boolean;
  idChecked: boolean;
  bagHanded: boolean;
}

/**
 * How the van sits in its stall at Kindling. The shift starts with it already parked, so
 * this is the same kerb rule every other stop uses rather than a hand-picked angle — the
 * van it returns to at the end of a run is the van it left in.
 */
const SHOP_PARK_HEADING = kerbParkHeading(CITY.shopSpawn, CITY.shopLot.street);

export class GameSim {
  readonly catalog: Sku[];
  readonly clock = new GameClock();
  score = 0;
  playerRole: PlayerRole = "keyLead";
  vehicle = tileToWorld(CITY.shopSpawn);
  toast: string = brand.welcomeToast;
  /** Shop-only ORDERS tablet notice; toast stays for drive / doorstep. */
  ordersNotice: string | null = "Welcome — watch ORDERS.";
  targetCallout: { skuId: string; text: string } | null = null;
  private customerFeedback = new Map<string, string>();
  input = { dx: 0, dy: 0 };
  autoSpawn: boolean;
  shiftEnded = false;
  private idMismatchFails = 0;
  private scoredActions = 0;
  private scoreFlash: ScoreFlash | null = null;
  private scoreFlashSeq = 0;
  private sfxCue: { id: number; kind: SfxKind } | null = null;
  private sfxSeq = 0;
  handSkuId: string | null = null;
  selectedOrderId: string | null = null;
  awaitingBag = false;
  private driverLine: string | null = null;
  private packQueue: string[] = [];

  private orders: Order[] = [];
  /** Completed/failed orders kept for shift results and orderById — pruned from the hot path. */
  private shiftLedger: Order[] = [];
  private customers: CustomerState[] = [];
  private nextOrderId = 1;
  private nextDeliveryHouse = 0;
  private queuedInteract = false;
  private npcCooldown = 0;
  private coverServed = 0;
  private coverLost = 0;
  /** Names the counter sale that just walked, so the driver's readout says who. */
  private coverLostName: string | null = null;
  private coverLostAt = 0;
  private spawnQueue: SpawnEvent[] = [];
  private lastAutoSpawn = 0;
  private nextTicketWaveAt = 0;
  private nextWalkInAt = 0;
  private rng: () => number;
  private runOrderIds: string[] = [];
  private nameSeed: number;
  private dropoff: DropoffState | null = null;
  private driveRoute: WorldPoint[] = [];
  /** Cached destination — skip A* when the stall has not changed. */
  private driveRouteDestKey = "";
  private driveWaypoint = 0;
  private driveArrived = false;
  private vehicleHeading = SHOP_PARK_HEADING;
  /** Heading the van is squaring up to in its stall, or null when it is not parking. */
  private parkHeading: number | null = null;
  private keyLeadX = KEYLEAD.x;
  private keyLeadPhase: KeyLeadPhase = "idle";
  private keyLeadFacing = 1;
  private fetchSkuId: string | null = null;
  private backroomLeftMs = 0;
  /** Per-step edge gate: cooldown + release before the next doorstep confirm. */
  private dropoffGate: DropoffConfirmGate | null = null;
  /** True while E/SPACE or a door pointer is held — one edge per press/tap. */
  private dropoffConfirmHeld = false;
  /** Reused across same-frame Shop/Drive/Door/Hud readers until the next mutation. */
  private snapCache: SimSnapshot | null = null;
  private customerBubbleKeys = new Map<string, string>();
  private customerBubbleCache = new Map<string, string>();
  private keyLeadCalloutKey = "";
  private keyLeadCalloutCache: string | null = null;
  /** One traffic list per sim step — tickDrive slices and DriveScene share it. */
  private trafficCacheMs = -1;
  private trafficCache: TrafficCarView[] = [];

  constructor(options: SimOptions = {}) {
    const seed = options.seed ?? 1;
    this.autoSpawn = options.autoSpawn ?? true;
    this.catalog = createCatalog(seed);
    this.rng = mulberryFrom(seed + 17);
    this.nameSeed = seed + 99;
    if (this.autoSpawn) this.queueOpeningOrders();
  }

  /** Start the opening ticket wave after the how-to overlay dismisses. */
  enableSpawns(): void {
    if (this.autoSpawn) return;
    this.touch();
    this.autoSpawn = true;
    this.queueOpeningOrders();
  }

  private queueOpeningOrders(): void {
    const base = this.clock.gameMs;
    const pickupAt = base + OPENING_FIRST_AT_MS + OPENING_ORDER_GAP_MS;
    const deliveryAt = pickupAt + OPENING_ORDER_GAP_MS;
    this.spawnQueue = [
      { atMs: base + OPENING_FIRST_AT_MS, type: "inStore" },
      { atMs: pickupAt, type: "pickup" },
      { atMs: deliveryAt, type: "delivery" },
      { atMs: deliveryAt, type: "delivery" },
    ];
    this.nextTicketWaveAt = deliveryAt + OPENING_ORDER_GAP_MS + FIRST_TICKET_WAVE_MS;
    this.nextWalkInAt = this.nextTicketWaveAt + FIRST_WALKIN_MS;
  }

  static create(options?: SimOptions): GameSim {
    return new GameSim(options);
  }

  /**
   * Settings → RESET TO 9 AM. Deliberately the same operation as `startNewDay`,
   * not a second implementation of it.
   *
   * This used to rewind the clock and restart SLA timers while leaving the floor as it
   * was, which stranded whatever was mid-flight: a walk-in kept standing at the counter
   * with no way to serve them, and the van stayed out on a run that no longer existed.
   * Twenty-five fields survived a reset in all. Two reset paths meant one of them was
   * always a field list drifting behind the other, so there is now only one.
   */
  resetToMorning(): void {
    this.touch();
    this.startNewDay();
  }

  /** End the shift early (settings) or when the clock hits 23:00. */
  endShift(): void {
    if (this.shiftEnded) return;
    this.touch();
    this.shiftEnded = true;
    this.clearDropoff();
    this.queuedInteract = false;
    this.input = { dx: 0, dy: 0 };
    this.driveArrived = true;
    this.driveRoute = [];
    this.driveRouteDestKey = "";
    this.parkHeading = null;
    this.toast = "Shift over. See your results.";
    this.ordersNotice = null;
    this.targetCallout = null;
    this.customerFeedback.clear();
  }

  /** Tester shortcut: same results card as 23:00, for time played so far. */
  endShiftEarly(): boolean {
    if (this.shiftEnded || this.scoredActions < 1) return false;
    this.endShift();
    return true;
  }

  /**
   * The one definition of a fresh session: 09:00, score 0, empty floor, shop playable.
   * Both the results card's New Day and the settings reset land here, so a field added
   * to the sim only has to be cleared in one place. `gameSim.test.ts` compares a reset
   * sim against a newly constructed one field by field, so forgetting one fails a test
   * rather than stranding a customer.
   */
  startNewDay(): void {
    this.touch();
    this.shiftEnded = false;
    this.score = 0;
    this.idMismatchFails = 0;
    this.scoredActions = 0;
    this.scoreFlash = null;
    this.sfxCue = null;
    this.clock.gameMs = 0;
    this.clearDropoff();
    this.playerRole = "keyLead";
    this.vehicle = tileToWorld(CITY.shopSpawn);
    this.vehicleHeading = SHOP_PARK_HEADING;
    this.parkHeading = null;
    this.driveRoute = [];
    this.driveRouteDestKey = "";
    this.driveWaypoint = 0;
    this.driveArrived = false;
    this.orders = [];
    this.shiftLedger = [];
    this.customers = [];
    this.runOrderIds = [];
    this.handSkuId = null;
    this.selectedOrderId = null;
    this.awaitingBag = false;
    this.packQueue = [];
    this.driverLine = null;
    this.keyLeadX = KEYLEAD.x;
    this.keyLeadPhase = "idle";
    this.keyLeadFacing = 1;
    this.fetchSkuId = null;
    this.backroomLeftMs = 0;
    this.npcCooldown = 0;
    this.coverServed = 0;
    this.coverLost = 0;
    this.coverLostName = null;
    this.coverLostAt = 0;
    this.queuedInteract = false;
    this.input = { dx: 0, dy: 0 };
    this.dropoffGate = null;
    this.dropoffConfirmHeld = false;
    this.lastAutoSpawn = 0;
    this.nextOrderId = 1;
    this.nextDeliveryHouse = 0;
    if (this.autoSpawn) this.queueOpeningOrders();
    else {
      this.spawnQueue = [];
      this.nextTicketWaveAt = 0;
      this.nextWalkInAt = 0;
    }
    // Three things deliberately carry over, and the reset test allows exactly these.
    // `scoreFlashSeq` / `sfxSeq` are monotonic UI event ids that the HUD dedupes against
    // its own last-seen id; rewinding them to 0 made the HUD swallow the first flash and
    // sound of the new day. `nameSeed` carries so a new day brings new customers rather
    // than replaying yesterday's. The toast names the reset instead of saying welcome.
    this.toast = "New day. Clock is 9:00 AM.";
    this.ordersNotice = "New day — watch ORDERS.";
    this.targetCallout = null;
    this.customerFeedback.clear();
    this.customerBubbleKeys.clear();
    this.customerBubbleCache.clear();
    this.keyLeadCalloutKey = "";
    this.keyLeadCalloutCache = null;
  }

  /** Drop cached view — any mutation that can change what snapshot() returns. */
  private touch(): void {
    this.snapCache = null;
  }

  /** Game clock without allocating a full SimSnapshot (PostFX / sky paths). */
  gameMs(): number {
    return this.clock.gameMs;
  }

  /** Role and dropoff phase without building a SimSnapshot — hot scene paths only. */
  rolePhase(): { role: PlayerRole; dropoffPhase: DropoffPhase | null } {
    return { role: this.playerRole, dropoffPhase: this.dropoff?.phase ?? null };
  }

  /** Cheap auto-drive probe for Hud input — avoids a full snapshot before tick. */
  isAutoDriving(): boolean {
    return this.playerRole === "driver" && this.dropoff?.phase !== "atDoor" && !this.driveArrived;
  }

  snapshot(): SimSnapshot {
    if (this.snapCache) return this.snapCache;
    const selected = this.selectedOrderId ? this.orderById(this.selectedOrderId) : undefined;
    this.snapCache = {
      gameMs: this.clock.gameMs,
      clockLabel: formatGameClock(this.clock.gameMs),
      score: this.score,
      playerRole: this.playerRole,
      catalog: this.catalog,
      handSkuId: this.handSkuId,
      handSkuName: this.handSkuId ? (skuById(this.catalog, this.handSkuId)?.name ?? null) : null,
      selectedOrderId: this.selectedOrderId,
      awaitingBag:
        !!selected &&
        selected.type !== "inStore" &&
        needsFetch(selected) &&
        this.handSkuId === selected.skuId &&
        this.keyLeadPhase === "idle",
      keyLead: {
        x: this.keyLeadX,
        y: KEYLEAD.y,
        facing: this.keyLeadFacing,
        phase: this.keyLeadPhase,
        visible: this.keyLeadPhase !== "inBack",
      },
      vehicle: { ...this.vehicle, heading: this.vehicleHeading },
      autoDriving: this.playerRole === "driver" && this.dropoff?.phase !== "atDoor" && !this.driveArrived,
      customers: this.customers.map((c) => ({
        orderId: c.orderId,
        x: c.x,
        kind: c.kind,
        slot: c.slot,
        bubble: this.customerBubbleView(c),
        feedback: this.customerFeedback.get(c.orderId) ?? null,
        look: this.customerLookFor(c.orderId),
      })),
      orders: this.orders.filter(isOpen).map((o) => this.toView(o)),
      bagsOnPickup: this.orders.filter((o) => o.status === "onPickupShelf" || o.status === "readyForHandoff").map((o) => o.id),
      bagsInBin: this.orders.filter((o) => o.status === "inBin").map((o) => o.id),
      run: this.runSnapshot(),
      shopCover: this.shopCoverView(),
      dropoff: this.toDropoffView(),
      toast: this.toast,
      ordersNotice: this.playerRole === "keyLead" ? this.ordersNotice : null,
      targetCallout: this.playerRole === "keyLead" ? this.targetCallout : null,
      serveLine: this.serveLine(),
      highlightSkuId: this.focusSkuId(),
      // A walk-in no longer pins the driver to the floor — the key lead covers the counter.
      canHitTheRoad:
        this.playerRole === "keyLead" &&
        (this.orders.some((o) => o.status === "inBin") || this.runOrderIds.length > 0),
      tabletTicket: this.toViewOrNull(this.tabletFront()),
      tabletQueueCount: tabletQueue(this.orders).length,
      keyLeadLine: this.keyLeadCalloutView(selected),
      driverLine: this.playerRole === "keyLead" ? this.driverLine : null,
      shiftEnded: this.shiftEnded,
      shiftResults: this.shiftEnded
        ? buildShiftResults(this.shiftLedger.concat(this.orders), this.score, this.clock.gameMs, this.idMismatchFails)
        : null,
      canEndShiftEarly: !this.shiftEnded && this.scoredActions >= 1,
      scoreFlash: this.scoreFlash,
      sfxCue: this.sfxCue,
    };
    return this.snapCache;
  }

  setPlayerInput(dx: number, dy: number): void {
    this.input.dx = clamp(dx, -1, 1);
    this.input.dy = clamp(dy, -1, 1);
  }

  queueInteract(): void {
    this.touch();
    this.queuedInteract = true;
  }

  /**
   * Edge-triggered confirm for driver curb/door steps. Keyboard and pointer paths
   * must pair `pressDropoffConfirm` with `releaseDropoffConfirm` so a held key or
   * touch cannot click through ASK → CHECK → bag → photo.
   */
  pressDropoffConfirm(): void {
    if (this.dropoffConfirmHeld) return;
    this.touch();
    this.dropoffConfirmHeld = true;
    if (this.driverDropoffGated() && !this.dropoffConfirmAccepts()) return;
    this.queueInteract();
  }

  releaseDropoffConfirm(): void {
    this.touch();
    this.dropoffConfirmHeld = false;
  }

  interact(): void {
    this.touch();
    if (this.playerRole === "driver") this.interactDriver();
    else this.shopClick({ type: "handoff" });
  }

  shopClick(click: ShopClick): void {
    if (this.shiftEnded) return;
    switch (click.type) {
      case "keyLead":
        this.setOrdersNotice("Pick a flashing ticket, then the item.");
        return;
      case "bagRack":
        this.packSelected();
        return;
      case "item":
        this.pickItem(click.skuId);
        return;
      case "tablet":
        this.selectTicket(click.orderId);
        return;
      case "handoff":
        this.tryHandoff();
        return;
      case "customer":
        this.onCustomerTap(click.orderId);
        return;
    }
  }

  setVehiclePosition(x: number, y: number): void {
    this.touch();
    this.vehicle.x = x;
    this.vehicle.y = y;
  }

  spawnOrder(type: OrderType, opts: { skuId?: string; destinationId?: string; idMatches?: boolean } = {}): Order {
    this.touch();
    const sku = opts.skuId
      ? skuById(this.catalog, opts.skuId)
      : this.catalog[Math.floor(this.rng() * this.catalog.length)];
    if (!sku) throw new Error("catalog empty");
    const id = `ord-${this.nextOrderId++}`;
    const customerName = generateCustomerName(this.nameSeed++);
    const idAge = ageForSeed(`${id}:${customerName}`);
    const idMatches = opts.idMatches ?? idMatchesForSeed(`${id}:${customerName}`);
    const order: Order = {
      id,
      type,
      skuId: sku.id,
      status: type === "inStore" ? "atRegister" : "queued",
      createdAtGameMs: this.clock.gameMs,
      customerName,
      idAge,
      idMatches,
      destinationId: type === "delivery" ? (opts.destinationId ?? this.nextHouse()) : undefined,
    };
    this.orders.push(order);
    if (type === "inStore") {
      this.customers.push(this.newCustomer(order.id, "inStore"));
      // Walk-in speech carries the ask. Mid-run, leave the driver's banner alone.
      if (this.playerRole === "keyLead") this.toast = "";
    } else if (type === "pickup") {
      const notice = `Pickup: ${order.customerName} — ${sku.name}`;
      if (this.playerRole === "keyLead") this.setOrdersNotice(notice);
      else this.toast = notice;
    } else {
      const notice = `Delivery: ${destLabel(order)} · ${order.customerName} — ${sku.name}`;
      if (this.playerRole === "keyLead") this.setOrdersNotice(notice);
      else this.toast = notice;
    }
    return order;
  }

  hitTheRoad(): boolean {
    this.touch();
    if (this.shiftEnded) return false;
    const fresh = this.orders.filter((o) => o.status === "inBin");
    if (this.playerRole === "keyLead" && fresh.length === 0 && this.runOrderIds.length === 0) {
      this.toast = "Need a named delivery bag first.";
      return false;
    }
    // A bag going out now needs its hour running, deferred or not.
    this.startDeferredSlas();
    for (const order of fresh) {
      order.status = "onRun";
      this.runOrderIds.push(order.id);
    }
    this.playerRole = "driver";
    this.driverLine = null;
    this.coverServed = 0;
    this.coverLost = 0;
    this.coverLostName = null;
    this.refreshDriveRoute();
    const walkIn = this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    this.toast = walkIn
      ? `Key lead has the counter — ${walkIn.customerName} is in good hands.`
      : this.runOrderIds.length > 1
        ? "Multi-stop run. Van is heading out."
        : "Hit the road. Van is heading to the stop.";
    return true;
  }

  backToShop(): boolean {
    this.touch();
    if (this.playerRole !== "driver") return false;
    const shop = tileToWorld(CITY.shopSpawn);
    if (dist(this.vehicle.x, this.vehicle.y, shop.x, shop.y) > HANDOFF_RADIUS) {
      this.toast = driveToShopFirstToast();
      return false;
    }
    this.clearDropoff();
    this.playerRole = "keyLead";
    this.driverLine = null;
    const served = this.coverServed;
    // The driver is back on the floor, so bags the key lead packed can start their hour.
    this.startDeferredSlas();
    this.toast = served
      ? backAtShopToast(served)
      : this.runOrderIds.length
        ? backAtShopBagsToast()
        : backAtShopToast(0);
    return true;
  }

  /**
   * The courier hour is a promise the shop can only keep with a driver in the building.
   * Bags the key lead packs mid-run hold their clock until the van is back, so a long
   * run cannot hand the player a bag that is already late.
   */
  private startDeferredSlas(): void {
    for (const order of this.orders) {
      if (!order.slaDeferred) continue;
      order.slaDeferred = false;
      if (isOpen(order)) order.slaStartGameMs = this.clock.gameMs;
    }
  }

  tick(dtMs: number): void {
    if (this.shiftEnded) return;
    this.clock.tick(dtMs);
    if (this.clock.gameMs >= SHIFT_MS) {
      this.endShift();
      return;
    }
    if (this.playerRole === "driver" && this.dropoff?.phase !== "atDoor") this.tickDrive(dtMs / 1000);
    this.tickParkHeading(dtMs / 1000);
    this.syncCurb();
    this.moveCustomers(dtMs);
    this.tickKeyLead(dtMs);
    this.tickCall();
    if (this.driverDropoffGated()) {
      const gateTick = tickDropoffGate(this.dropoffGate, this.clock.gameMs, {
        queuedInteract: this.queuedInteract,
        confirmHeld: this.dropoffConfirmHeld,
      });
      this.dropoffGate = gateTick.gate;
      if (gateTick.swallowQueued) this.queuedInteract = false;
      if (
        this.dropoffConfirmHeld &&
        this.dropoffGate &&
        !this.queuedInteract &&
        this.clock.gameMs >= this.dropoffGate.readyAt + NPC_INTERACT_COOLDOWN_MS
      ) {
        this.releaseDropoffConfirm();
      }
    }
    if (this.queuedInteract) {
      this.queuedInteract = false;
      this.interact();
    }
    if (this.playerRole === "driver") this.tickCounterCover(dtMs);
    this.tickTimers();
    this.tickSpawns();
    this.patchSnapCacheFromTick();
  }

  /**
   * Motion during tick changes gameMs and entity positions every frame; rebuilding the
   * full snapshot (customer bubbles, order views, …) on each tick was the fetch-walk stall.
   * Patch the cache in place when it exists; discrete mutations still call touch().
   */
  private patchSnapCacheFromTick(): void {
    const c = this.snapCache;
    if (!c) return;
    if (c.customers.length !== this.customers.length) {
      this.touch();
      return;
    }
    c.gameMs = this.clock.gameMs;
    c.clockLabel = formatGameClock(this.clock.gameMs);
    c.keyLead.x = this.keyLeadX;
    c.keyLead.facing = this.keyLeadFacing;
    c.keyLead.phase = this.keyLeadPhase;
    c.keyLead.visible = this.keyLeadPhase !== "inBack";
    c.handSkuId = this.handSkuId;
    c.handSkuName = this.handSkuId ? (skuById(this.catalog, this.handSkuId)?.name ?? null) : null;
    const selected = this.selectedOrderId ? this.orderById(this.selectedOrderId) : undefined;
    c.awaitingBag =
      !!selected &&
      selected.type !== "inStore" &&
      needsFetch(selected) &&
      this.handSkuId === selected.skuId &&
      this.keyLeadPhase === "idle";
    const klKey = this.keyLeadCalloutInputsKey(selected);
    if (klKey !== this.keyLeadCalloutKey) {
      this.keyLeadCalloutKey = klKey;
      this.keyLeadCalloutCache = this.keyLeadCallout(selected);
    }
    c.keyLeadLine = this.keyLeadCalloutCache;
    c.ordersNotice = this.playerRole === "keyLead" ? this.ordersNotice : null;
    for (const src of this.customers) {
      const dst = c.customers.find((v) => v.orderId === src.orderId);
      if (!dst) {
        this.touch();
        return;
      }
      dst.x = src.x;
      const bubbleKey = this.customerBubbleInputsKey(src);
      if (bubbleKey !== this.customerBubbleKeys.get(src.orderId)) {
        this.customerBubbleKeys.set(src.orderId, bubbleKey);
        const bubble = this.customerBubble(src);
        this.customerBubbleCache.set(src.orderId, bubble);
        dst.bubble = bubble;
      }
    }
    c.vehicle = { ...this.vehicle, heading: this.vehicleHeading };
    c.autoDriving = this.playerRole === "driver" && this.dropoff?.phase !== "atDoor" && !this.driveArrived;
    c.shopCover = this.shopCoverView();
    c.dropoff = this.toDropoffView();
    c.run = this.runSnapshot();
    c.serveLine = this.serveLine();
    c.driverLine = this.playerRole === "keyLead" ? this.driverLine : null;
  }

  orderById(id: string): Order | undefined {
    return this.orders.find((o) => o.id === id) ?? this.shiftLedger.find((o) => o.id === id);
  }

  /** Active orders only — terminal orders live in shiftLedger. */
  activeOrderCount(): number {
    return this.orders.length;
  }

  setDriverPosition(x: number, y: number): void {
    this.touch();
    if (this.dropoff?.driver) {
      this.dropoff.driver.x = x;
      this.dropoff.driver.y = y;
    }
  }

  dropoffAct(): void {
    this.touch();
    this.interactDriver();
  }

  private packSelected(): void {
    const order = this.selectedTicket();
    if (!order) {
      this.setOrdersNotice("Tap a flashing ticket, then the item.");
      return;
    }
    if (this.keyLeadPhase !== "idle") {
      this.setOrdersNotice("Wait — they're grabbing it.");
      return;
    }
    if (!this.handSkuId) {
      const sku = skuById(this.catalog, order.skuId);
      this.setOrdersNotice(`Tap ${sku?.name ?? "the item"} on the wall first.`);
      return;
    }
    if (this.handSkuId !== order.skuId) {
      this.setOrdersNotice(`Wrong item for ${order.customerName}.`);
      this.setTargetCallout(this.handSkuId, "Wrong item");
      return;
    }
    this.touch();
    this.handSkuId = null;
    this.sealBag(order);
    this.pushSfx("pack");
  }

  private selectedTicket(): Order | undefined {
    const order = this.selectedOrderId ? this.orderById(this.selectedOrderId) : undefined;
    if (!order || order.type === "inStore" || !needsFetch(order)) return undefined;
    return order;
  }

  private pickItem(skuId: string): void {
    const sku = skuById(this.catalog, skuId);
    if (!sku) return;
    if (this.keyLeadPhase !== "idle") {
      this.setOrdersNotice("They're already in the back.");
      return;
    }
    const walkIn = this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    if (walkIn && this.customerAtCounter(walkIn.id)) {
      if (skuId !== walkIn.skuId) {
        const want = skuById(this.catalog, walkIn.skuId)?.name;
        this.setCustomerFeedback(walkIn.id, `Wrong TV — wants ${want}.`);
        this.setTargetCallout(skuId, "Wrong TV");
        this.pushSfx("wrong");
        return;
      }
      if (this.handSkuId === skuId) {
        this.clearCustomerFeedback(walkIn.id);
        return;
      }
      this.clearCustomerFeedback(walkIn.id);
      this.startFetch(skuId);
      return;
    }
    if (walkIn && !this.customerAtCounter(walkIn.id)) {
      this.setCustomerFeedback(walkIn.id, `${walkIn.customerName} is still walking in.`);
      return;
    }
    const ticket = this.selectedTicket();
    if (ticket) {
      if (this.handSkuId === ticket.skuId) {
        this.clearTargetCallout();
        return;
      }
      if (skuId !== ticket.skuId) {
        const want = skuById(this.catalog, ticket.skuId)?.name;
        this.setTargetCallout(skuId, "Wrong TV");
        this.setOrdersNotice(`Wrong TV. ${ticket.customerName} ordered ${want}.`);
        this.pushSfx("wrong");
        return;
      }
      this.startFetch(skuId);
      return;
    }
    this.setOrdersNotice("Select a ticket first — walk-ins can tap the TV they asked for.");
  }

  private startFetch(skuId: string): void {
    if (this.handSkuId === skuId) {
      // keyLeadCallout already shows Holding…; nothing else to say.
      this.clearTargetCallout();
      return;
    }
    this.touch();
    this.fetchSkuId = skuId;
    this.keyLeadPhase = "toBack";
    this.keyLeadFacing = -1;
    this.clearTargetCallout();
  }

  private tickKeyLead(dtMs: number): void {
    // Catch up after long frames so a hitch cannot leave the key-lead mid-fetch forever.
    const SLICE_MS = 32;
    let remaining = dtMs;
    let steps = 0;
    while (remaining > 0 && this.keyLeadPhase !== "idle" && steps < 256) {
      const slice = Math.min(SLICE_MS, remaining);
      this.tickKeyLeadSlice(slice);
      remaining -= slice;
      steps += 1;
    }
  }

  private tickKeyLeadSlice(dtMs: number): void {
    const dt = dtMs / 1000;
    const step = KEYLEAD_WALK_SPEED * dt;
    if (this.keyLeadPhase === "toBack") {
      this.keyLeadFacing = -1;
      const dest = BACK_DOOR.x;
      if (Math.abs(this.keyLeadX - dest) <= step) {
        this.keyLeadX = dest;
        this.keyLeadPhase = "inBack";
        this.backroomLeftMs = BACKROOM_MS;
      } else {
        this.keyLeadX += Math.sign(dest - this.keyLeadX) * step;
      }
      return;
    }
    if (this.keyLeadPhase === "inBack") {
      this.backroomLeftMs -= dtMs;
      if (this.backroomLeftMs <= 0) {
        this.handSkuId = this.fetchSkuId;
        this.keyLeadPhase = "fromBack";
        this.keyLeadFacing = 1;
      }
      return;
    }
    if (this.keyLeadPhase === "fromBack") {
      this.keyLeadFacing = 1;
      const dest = KEYLEAD.x;
      if (Math.abs(this.keyLeadX - dest) <= step) {
        this.keyLeadX = dest;
        this.keyLeadPhase = "idle";
        // Holding callout on the key lead covers "Got X — tap …".
      } else {
        this.keyLeadX += Math.sign(dest - this.keyLeadX) * step;
      }
    }
  }

  private sealBag(order: Order): void {
    this.touch();
    if (order.type === "delivery") {
      order.status = "inBin";
      if (this.playerRole === "driver") {
        order.slaDeferred = true;
        delete order.slaStartGameMs;
        this.setOrdersNotice(`Bag · ${destLabel(order)} · ${order.customerName}`);
      } else {
        order.slaStartGameMs = this.clock.gameMs;
        this.setOrdersNotice(`Packed · ${destLabel(order)} · ${order.customerName}`);
      }
    } else {
      order.status = "onPickupShelf";
      order.slaStartGameMs = this.clock.gameMs;
      this.setOrdersNotice(`Pickup packed · ${order.customerName}`);
    }
    this.awaitingBag = false;
    if (this.selectedOrderId === order.id) this.selectedOrderId = null;
    this.advancePackQueue();
  }

  private claimedTicketIds(): Set<string> {
    const ids = new Set(this.packQueue);
    if (this.selectedOrderId) ids.add(this.selectedOrderId);
    return ids;
  }

  private ticketInProgress(): boolean {
    const selected = this.selectedOrderId ? this.orderById(this.selectedOrderId) : undefined;
    return !!selected && selected.type !== "inStore" && needsFetch(selected);
  }

  private beginTicket(order: Order): void {
    this.touch();
    this.selectedOrderId = order.id;
    this.driverLine = null;
    const sku = skuById(this.catalog, order.skuId);
    this.setOrdersNotice(
      order.type === "delivery"
        ? `Delivery · ${order.customerName} — ${sku?.name}`
        : `Pickup · ${order.customerName} — ${sku?.name}`,
    );
    this.pushSfx("ticket");
  }

  private enqueueTicket(order: Order): void {
    if (this.packQueue.includes(order.id)) {
      this.setOrdersNotice(`Already queued ${order.customerName}.`);
      return;
    }
    this.touch();
    this.packQueue.push(order.id);
    this.setOrdersNotice(`Queued ${order.customerName}. Finish packing first.`);
  }

  private advancePackQueue(): void {
    while (this.packQueue.length > 0) {
      const nextId = this.packQueue.shift()!;
      const next = this.orderById(nextId);
      if (next && isOpen(next) && needsFetch(next)) {
        this.beginTicket(next);
        return;
      }
    }
  }

  private dropQueuedTicket(orderId: string): void {
    this.packQueue = this.packQueue.filter((id) => id !== orderId);
  }

  private selectTicket(orderId: string): void {
    const order = this.orderById(orderId);
    if (!order || !isOpen(order) || order.type === "inStore") {
      this.setOrdersNotice("That ticket is not on the tablet.");
      return;
    }
    if (order.status !== "queued") {
      this.setOrdersNotice("That ticket is not on the tablet.");
      return;
    }
    if (this.selectedOrderId === order.id) {
      this.setOrdersNotice(`Already packing ${order.customerName}.`);
      return;
    }
    if (this.packQueue.includes(order.id)) {
      this.setOrdersNotice(`Already queued ${order.customerName}.`);
      return;
    }
    if (this.ticketInProgress()) {
      this.enqueueTicket(order);
      return;
    }
    this.beginTicket(order);
  }

  private tryHandoff(): void {
    if (this.tryServeWalkIn()) return;
    const waiting = this.orders.find((o) => o.type === "pickup" && o.status === "readyForHandoff");
    if (waiting && this.customerAtCounter(waiting.id)) {
      this.complete(waiting);
      return;
    }
    if (waiting) this.setCustomerFeedback(waiting.id, "Wait for them at the counter.");
    else this.setOrdersNotice("Nobody is waiting for a bag.");
  }

  private onCustomerTap(orderId: string): void {
    const order = this.orderById(orderId);
    if (!order || !isOpen(order)) return;
    if (order.type === "inStore") {
      if (!this.customerAtCounter(orderId)) {
        this.setCustomerFeedback(orderId, `${order.customerName} is still walking in.`);
        return;
      }
      if (this.selectedOrderId !== orderId) {
        this.touch();
        this.selectedOrderId = orderId;
      }
      this.tryServeWalkIn(order);
      return;
    }
    if (order.status === "readyForHandoff") {
      if (!this.customerAtCounter(orderId)) {
        this.setCustomerFeedback(orderId, "Wait for them at the counter.");
        return;
      }
      this.complete(order);
      return;
    }
    this.tryHandoff();
  }

  private tryServeWalkIn(order?: Order): boolean {
    const target =
      order ?? this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    if (!target) return false;
    if (!this.customerAtCounter(target.id)) {
      this.setCustomerFeedback(target.id, `Wait for ${target.customerName} at the counter.`);
      return true;
    }
    const sku = skuById(this.catalog, target.skuId);
    if (!this.handSkuId) {
      return true;
    }
    if (this.keyLeadPhase !== "idle") {
      this.setCustomerFeedback(target.id, "Wait — they're grabbing it.");
      return true;
    }
    if (this.handSkuId !== target.skuId) {
      this.setCustomerFeedback(
        target.id,
        `Wrong TV — wants ${sku?.name ?? "a different item"}.`,
      );
      this.setTargetCallout(this.handSkuId, "Wrong item");
      this.pushSfx("wrong");
      return true;
    }
    this.touch();
    this.handSkuId = null;
    this.complete(target);
    return true;
  }

  private shopCoverView(): ShopCoverView {
    const walkIns = this.orders.filter((o) => o.type === "inStore" && o.status === "atRegister");
    const pickups = this.orders.filter((o) => o.status === "readyForHandoff");
    return {
      active: this.playerRole === "driver",
      line: this.coverLine(walkIns[0], pickups[0]),
      waiting: walkIns.length + pickups.length,
      packed: this.orders.filter((o) => o.status === "inBin").length,
      served: this.coverServed,
      lost: this.coverLost,
    };
  }

  /**
   * Mirrors the cover loop's own priority so the readout never names the wrong job — and
   * says plainly when the key lead is too deep to reach somebody, so a lost sale arrives
   * with its reason attached instead of as an unexplained score drop.
   */
  private coverLine(walkIn: Order | undefined, pickup: Order | undefined): string {
    if (this.coverLostName && this.clock.gameMs - this.coverLostAt < COVER_LOSS_LINE_MS) {
      return `${this.coverLostName} gave up and left`;
    }
    if (this.keyLeadPhase !== "idle") {
      const sku = this.fetchSkuId ? skuById(this.catalog, this.fetchSkuId) : undefined;
      return sku ? `In the back for ${sku.name}` : "In the back";
    }
    if (walkIn) {
      if (!this.customerAtCounter(walkIn.id)) return `${walkIn.customerName} is walking in`;
      if (!this.coverNoticed(walkIn)) return this.backedUpLine(walkIn);
      return `Serving ${walkIn.customerName}`;
    }
    if (pickup && this.customerAtCounter(pickup.id)) {
      return this.coverNoticed(pickup)
        ? `Handing ${pickup.customerName} their pickup`
        : this.backedUpLine(pickup);
    }
    const ticket = this.selectedTicket() ?? this.tabletFront();
    if (ticket) {
      const sku = skuById(this.catalog, ticket.skuId);
      return `Packing ${sku?.name ?? "a bag"} for ${ticket.customerName}`;
    }
    if (pickup) return `Waiting on ${pickup.customerName}`;
    // The HUD already prefixes this with COUNTER, so saying it again reads as a stutter.
    return "Nobody waiting";
  }

  /** Names both the person being kept waiting and the depth that is keeping them there. */
  private backedUpLine(order: Order): string {
    return `Buried — ${this.counterLoad()} jobs, ${order.customerName} still waiting`;
  }

  private runSnapshot(): DeliveryRun | null {
    if (this.runOrderIds.length === 0) return null;
    return { orderIds: [...this.runOrderIds], nextStopId: this.nextStopId() };
  }

  private nextStopId(): string | null {
    const remaining = this.runOrderIds
      .map((id) => this.orderById(id))
      .filter((o): o is Order => !!o && o.status === "onRun");
    if (remaining.length === 0) return null;
    let best: Order | null = null;
    let bestD = Infinity;
    for (const order of remaining) {
      const house = order.destinationId ? houseById(order.destinationId) : undefined;
      if (!house) continue;
      const pos = tileToWorld(house.stop);
      const d = dist(this.vehicle.x, this.vehicle.y, pos.x, pos.y);
      if (d < bestD) {
        bestD = d;
        best = order;
      }
    }
    return best?.destinationId ?? remaining[0]?.destinationId ?? null;
  }

  private toView(order: Order): OrderView {
    const sku = skuById(this.catalog, order.skuId);
    let slaRemainingMs: number | null = null;
    if (order.type === "delivery" && order.slaStartGameMs !== undefined) {
      slaRemainingMs = MS_PER_GAME_HOUR - (this.clock.gameMs - order.slaStartGameMs);
    } else if (order.type === "pickup" && order.status === "onPickupShelf" && order.slaStartGameMs !== undefined) {
      slaRemainingMs = PICKUP_ARRIVE_MS - (this.clock.gameMs - order.slaStartGameMs);
    } else if (order.type === "pickup" && order.status === "readyForHandoff" && order.arriveAtGameMs !== undefined) {
      slaRemainingMs = PICKUP_HANDOFF_WAIT_MS - (this.clock.gameMs - order.arriveAtGameMs);
    } else if (order.type === "inStore" && order.arriveAtGameMs !== undefined) {
      slaRemainingMs = INSTORE_WALKOUT_MS - (this.clock.gameMs - order.arriveAtGameMs);
    }
    return {
      id: order.id,
      type: order.type,
      skuId: order.skuId,
      skuName: sku?.name ?? order.skuId,
      customerName: order.customerName,
      status: order.status,
      destinationId: order.destinationId,
      destLabel: destLabel(order),
      slaRemainingMs,
      createdAtGameMs: order.createdAtGameMs,
      late: order.type === "delivery" && isDeliveryLate(order, this.clock.gameMs),
    };
  }

  /**
   * Appearance for an order's customer, from the same name/age pair the ID card is
   * built from — see `customerLookIndex`. Orders outlive their walk-in sprite, so
   * this derives on demand rather than being stored on the sprite.
   */
  private customerLookFor(orderId: string): number {
    const order = this.orderById(orderId);
    if (!order) return 0;
    return customerLookIndex(order.customerName, order.idAge);
  }

  /** The lane-snapped route the van is following, for the phone minimap. */
  routeWorldPath(): readonly WorldPoint[] {
    return this.driveRoute;
  }

  /** Traffic car views for this sim step — reused across tickDrive slices and DriveScene. */
  trafficForDrive(): readonly TrafficCarView[] {
    const ms = this.clock.gameMs;
    if (ms !== this.trafficCacheMs) {
      this.trafficCacheMs = ms;
      this.trafficCache = trafficCars(ms, cityTrafficLoops(), {
        x: this.vehicle.x,
        y: this.vehicle.y,
        heading: this.vehicleHeading,
      });
    }
    return this.trafficCache;
  }

  private customerBubbleInputsKey(customer: CustomerState): string {
    const order = this.orderById(customer.orderId);
    if (!order) return "";
    const atCounter = this.customerAtCounter(customer.orderId);
    const farFromTarget = Math.abs(customer.x - customer.targetX) > 24;
    return `${order.status}:${order.skuId}:${customer.kind}:${farFromTarget ? 1 : 0}:${atCounter ? 1 : 0}:${this.handSkuId ?? ""}`;
  }

  private customerBubbleView(customer: CustomerState): string {
    const key = this.customerBubbleInputsKey(customer);
    const prevKey = this.customerBubbleKeys.get(customer.orderId);
    if (prevKey === key) {
      const cached = this.customerBubbleCache.get(customer.orderId);
      if (cached !== undefined) return cached;
    }
    this.customerBubbleKeys.set(customer.orderId, key);
    const bubble = this.customerBubble(customer);
    this.customerBubbleCache.set(customer.orderId, bubble);
    return bubble;
  }

  private keyLeadCalloutInputsKey(selected: Order | undefined): string {
    return `${this.keyLeadPhase}:${this.fetchSkuId ?? ""}:${this.handSkuId ?? ""}:${selected?.id ?? ""}:${selected?.type ?? ""}:${selected?.skuId ?? ""}`;
  }

  private keyLeadCalloutView(selected: Order | undefined): string | null {
    const key = this.keyLeadCalloutInputsKey(selected);
    if (key === this.keyLeadCalloutKey) return this.keyLeadCalloutCache;
    this.keyLeadCalloutKey = key;
    this.keyLeadCalloutCache = this.keyLeadCallout(selected);
    return this.keyLeadCalloutCache;
  }

  private customerBubble(customer: CustomerState): string {
    const order = this.orderById(customer.orderId);
    const sku = order ? skuById(this.catalog, order.skuId) : undefined;
    if (!order || !sku) return "";
    if (customer.kind === "pickup") {
      if (order.status !== "readyForHandoff") return "Pickup";
      if (!this.customerAtCounter(customer.orderId)) return "On the way…";
      return "Tap me — pickup";
    }
    if (Math.abs(customer.x - customer.targetX) > 24) return "Coming in…";
    if (order.status === "readyForHandoff") {
      return this.handSkuId === order.skuId ? "Tap me" : `Tap me — ${sku.name}`;
    }
    if (this.handSkuId === order.skuId) return "Tap me";
    return `I want ${sku.name}`;
  }

  private driveTargetWorld(): { x: number; y: number } | null {
    const stall = this.driveTargetStall();
    return stall ? tileToWorld(stall.stop) : null;
  }

  /** The stall the van is driving to, with the kerb it fronts so it can arrive lawfully. */
  private driveTargetStall(): StallApproach | null {
    const stopId = this.nextStopId();
    if (stopId) {
      const house = houseById(stopId);
      return house ? { stop: house.stop, street: house.street, parking: house.parking } : null;
    }
    if (this.playerRole !== "driver") return null;
    return { stop: CITY.shopSpawn, street: CITY.shopLot.street, parking: CITY.shopLot.parking };
  }

  private driveDestinationKey(): string {
    const stopId = this.nextStopId();
    if (stopId) return `house:${stopId}`;
    if (this.playerRole === "driver") return "shop";
    return "";
  }

  private refreshDriveRoute(): void {
    const stall = this.driveTargetStall();
    const destKey = stall ? this.driveDestinationKey() : "";
    // Pulling away cancels any turn still being made in the stall we are leaving.
    this.parkHeading = null;
    if (!stall) {
      this.driveRoute = [];
      this.driveRouteDestKey = "";
      this.driveWaypoint = 0;
      this.driveArrived = false;
      return;
    }
    if (destKey === this.driveRouteDestKey && this.driveRoute.length > 0) return;
    this.driveRouteDestKey = destKey;
    const target = tileToWorld(stall.stop);
    const from = worldToTile(this.vehicle.x, this.vehicle.y);
    const start = CITY.walkable[from.r]?.[from.c] ? from : CITY.shopSpawn;
    // Along the kerb the stall fronts, or across the road where that saves a block — the van
    // waits for a gap in the lane it cuts through rather than clipping through it.
    const cells = approachToStall(CITY.walkable, start, stall);
    this.driveRoute = routeWorldPoints(snapPathToDriveLanes(cells));
    // Final point is the parking stall center — no lane offset.
    if (this.driveRoute.length > 0) {
      this.driveRoute[this.driveRoute.length - 1] = { x: target.x, y: target.y };
    }
    this.driveWaypoint = 0;
    this.driveArrived = false;
  }

  private tickDrive(dt: number): void {
    // Catch up after long frames so a hitch cannot tunnel through traffic gaps.
    const SLICE = 0.05;
    let remaining = dt;
    let steps = 0;
    while (remaining > 0 && !this.driveArrived && steps < 256) {
      const slice = Math.min(SLICE, remaining);
      const mag = Math.hypot(this.input.dx, this.input.dy);
      if (mag > 0.2) this.tickManualDrive(slice);
      else this.tickAutoDrive(slice);
      remaining -= slice;
      steps += 1;
    }
  }

  private tickManualDrive(dt: number): void {
    const mag = Math.hypot(this.input.dx, this.input.dy) || 1;
    const ux = this.input.dx / mag;
    const uy = this.input.dy / mag;
    const traffic = this.trafficForDrive();
    const speed = driveSpeedForTraffic(
      { x: this.vehicle.x, y: this.vehicle.y, heading: this.vehicleHeading },
      traffic,
      VEHICLE_SPEED,
    );
    this.vehicle.x = clamp(this.vehicle.x + ux * speed * dt, TILE, MAP_PX_W - TILE);
    this.vehicle.y = clamp(this.vehicle.y + uy * speed * dt, TILE, MAP_PX_H - TILE);
    this.vehicleHeading = Math.atan2(uy, ux);
    const target = this.driveTargetWorld();
    if (target && dist(this.vehicle.x, this.vehicle.y, target.x, target.y) <= PARK_ARRIVE_RADIUS) {
      this.parkAt(target);
    }
  }

  private tickAutoDrive(dt: number): void {
    if (this.driveArrived) return;
    const target = this.driveTargetWorld();
    if (!target) return;
    if (this.driveRoute.length === 0) this.refreshDriveRoute();
    if (this.driveRoute.length === 0) return;

    if (dist(this.vehicle.x, this.vehicle.y, target.x, target.y) <= PARK_ARRIVE_RADIUS) {
      this.parkAt(target);
      return;
    }

    // Route points are already on walkable tiles (right-lane offset); trust the path.
    // Match a slower lead car's speed until it clears the lane ahead.
    const traffic = this.trafficForDrive();
    // The waypoint the van is steering for, not the way it is pointing: a turn across the
    // road has to be seen before it is begun, and mid-turn the nose is still in the old lane.
    const aim = this.driveRoute[this.driveWaypoint];
    const intent = aim ? Math.atan2(aim.y - this.vehicle.y, aim.x - this.vehicle.x) : undefined;
    const speed = driveSpeedForTraffic(
      { x: this.vehicle.x, y: this.vehicle.y, heading: this.vehicleHeading },
      traffic,
      VEHICLE_SPEED,
      undefined,
      intent,
    );
    const step = advanceRoute(this.vehicle.x, this.vehicle.y, this.driveWaypoint, this.driveRoute, speed, dt);
    this.vehicle.x = clamp(step.x, TILE, MAP_PX_W - TILE);
    this.vehicle.y = clamp(step.y, TILE, MAP_PX_H - TILE);
    this.driveWaypoint = step.waypoint;
    // Ease through 90° corners like ambient traffic — segment heading, short lerp (no spin).
    const turn = 1 - Math.exp(-dt * 8);
    this.vehicleHeading = lerpAngle(this.vehicleHeading, step.heading, turn);
    if (step.arrived || dist(this.vehicle.x, this.vehicle.y, target.x, target.y) <= PARK_ARRIVE_RADIUS) {
      this.parkAt(target);
    }
  }

  private parkAt(target: { x: number; y: number }): void {
    this.vehicle.x = target.x;
    this.vehicle.y = target.y;
    this.arriveAtDriveTarget(target);
  }

  private arriveAtDriveTarget(target: { x: number; y: number }): void {
    if (this.driveArrived) return;
    this.driveArrived = true;
    const stopId = this.nextStopId();
    if (stopId) {
      const house = houseById(stopId);
      if (house) {
        this.parkHeading = stallRestHeading(
          this.vehicleHeading,
          kerbParkHeading(house.stop, house.street),
        );
      }
      const order = this.runOrderIds
        .map((id) => this.orderById(id))
        .find((o) => o?.destinationId === stopId && o.status === "onRun");
      this.toast = order
        ? `Parked at ${destLabel(order)}.`
        : "Parked.";
      return;
    }
    if (dist(this.vehicle.x, this.vehicle.y, target.x, target.y) <= HANDOFF_RADIUS) {
      this.parkHeading = stallRestHeading(this.vehicleHeading, SHOP_PARK_HEADING);
      this.toast = parkedAtShopToast();
    }
  }

  /**
   * The last quarter turn into the stall. Runs after the drive tick has bowed out on
   * `driveArrived`, so it is the only thing still moving the van — and it stops moving it
   * the moment the parked heading is reached, which is what lets a test assert an exact
   * angle rather than an asymptote.
   */
  private tickParkHeading(dt: number): void {
    const target = this.parkHeading;
    if (target === null) return;
    const delta = angleDelta(this.vehicleHeading, target);
    const step = PARK_TURN_RATE * dt;
    if (Math.abs(delta) <= step) {
      this.vehicleHeading = normalizeAngle(target);
      this.parkHeading = null;
      return;
    }
    this.vehicleHeading = normalizeAngle(this.vehicleHeading + Math.sign(delta) * step);
  }

  /**
   * A customer through the door, walking to standing room of their own. Every customer
   * used to be sent to the single counter spot, so a walk-in and any pickup waiting on
   * a handoff stood inside each other — one silhouette with two heads. The slot is the
   * lowest one free, held until they leave, so nobody shuffles sideways because someone
   * else was served.
   */
  private newCustomer(orderId: string, kind: "inStore" | "pickup"): CustomerState {
    const taken = new Set(this.customers.map((c) => c.slot));
    let slot = 0;
    while (taken.has(slot)) slot += 1;
    return { orderId, x: DOOR.x, targetX: customerSlotX(slot), kind, slot };
  }

  private moveCustomers(dtMs: number): void {
    const dt = dtMs / 1000;
    const step = CUSTOMER_SPEED * dt;
    for (const customer of this.customers) {
      const delta = customer.targetX - customer.x;
      if (Math.abs(delta) <= Math.max(1, step)) {
        customer.x = customer.targetX;
        const order = this.orderById(customer.orderId);
        if (order?.type === "inStore" && order.arriveAtGameMs === undefined && order.status === "atRegister") {
          order.arriveAtGameMs = this.clock.gameMs;
          if (!this.selectedOrderId) this.selectedOrderId = order.id;
          this.clearCustomerFeedback(order.id);
          this.touch();
        } else if (
          order?.type === "pickup" &&
          order.status === "readyForHandoff" &&
          order.arriveAtGameMs === undefined
        ) {
          order.arriveAtGameMs = this.clock.gameMs;
          this.clearCustomerFeedback(order.id);
          if (this.playerRole === "keyLead") {
            this.setOrdersNotice(`${order.customerName} is at the counter for pickup.`);
          } else {
            this.toast = `${order.customerName} is at the counter for pickup.`;
          }
          this.touch();
        }
        continue;
      }
      customer.x += Math.sign(delta) * step;
    }
  }

  /**
   * The counter does not close because the van left. While the player drives, the key lead
   * works the floor on their own: walk-ins first, then a pickup customer who is already
   * standing there, then whatever ticket is next on the tablet. One job at a time.
   *
   * They are good, not superhuman. See `coverNoticeMs` — a counter the player left deep
   * takes them longer to look up from, and somebody can leave before they get there.
   */
  private tickCounterCover(dtMs: number): void {
    this.npcCooldown -= dtMs;
    if (this.npcCooldown > 0) return;
    if (this.keyLeadPhase !== "idle") {
      this.npcCooldown = NPC_INTERACT_COOLDOWN_MS;
      return;
    }
    if (this.coverWalkIn() || this.coverPickup() || this.coverTicket()) {
      this.npcCooldown = NPC_INTERACT_COOLDOWN_MS;
    }
  }

  /**
   * Everything the counter is still carrying: people standing at it, tickets stacked on
   * the tablet, and bags packed for a van that has not come back for them. The bags are
   * the term that matters — a ticket wave drains in seconds, but a labelled bag sits
   * there until a driver takes it, so the pile is a direct measure of how long the shop
   * has been a person short. Come back and run them out and the counter empties again.
   */
  private counterLoad(): number {
    const standing = this.orders.filter(
      (o) => (o.type === "inStore" && o.status === "atRegister") || o.status === "readyForHandoff",
    ).length;
    const packed = this.orders.filter((o) => o.status === "inBin").length;
    return standing + packed + tabletQueue(this.orders).length;
  }

  /**
   * How long it takes the key lead to look up and register a new face. Alone with one
   * job they turn round instantly; every other job already waiting adds a beat. A
   * walk-in gives them INSTORE_WALKOUT_MS and a pickup customer rather less, so past a
   * certain depth the counter starts shedding the people it cannot get to. Deterministic
   * on purpose: "I left them seven deep" is a reason a player can act on, a dice roll is not.
   */
  private coverNoticeMs(): number {
    const others = Math.max(0, this.counterLoad() - 1);
    return COVER_NOTICE_STEP_MS * Math.min(others, COVER_NOTICE_MAX_STEPS);
  }

  /** True once the key lead has had time to notice whoever arrived at the counter. */
  private coverNoticed(order: Order): boolean {
    if (order.arriveAtGameMs === undefined) return false;
    return this.clock.gameMs - order.arriveAtGameMs >= this.coverNoticeMs();
  }

  private coverWalkIn(): boolean {
    const walkIn = this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    if (!walkIn) return false;
    // Nothing else can be fetched while someone is crossing the floor, so hold the turn.
    if (!this.customerAtCounter(walkIn.id)) return true;
    if (!this.coverNoticed(walkIn)) {
      // Head still down. A bag already in their hands can be closed out; nothing new starts.
      const ticket = this.selectedTicket();
      if (ticket && this.handSkuId === ticket.skuId) this.shopClick({ type: "bagRack" });
      return true;
    }
    if (this.handSkuId === walkIn.skuId) this.shopClick({ type: "customer", orderId: walkIn.id });
    else this.shopClick({ type: "item", skuId: walkIn.skuId });
    return true;
  }

  private coverPickup(): boolean {
    const waiting = this.orders.find(
      (o) => o.status === "readyForHandoff" && this.customerAtCounter(o.id),
    );
    if (!waiting) return false;
    if (!this.coverNoticed(waiting)) return false;
    this.shopClick({ type: "handoff" });
    return true;
  }

  private coverTicket(): boolean {
    let ticket = this.selectedTicket();
    if (!ticket) {
      // Whatever the player left claimed comes first; a stranded queue heals itself here.
      this.advancePackQueue();
      ticket = this.selectedTicket();
    }
    if (!ticket) {
      const next = this.tabletFront();
      if (!next) return false;
      this.beginTicket(next);
      return true;
    }
    // An item in hand that this ticket does not want gets swapped by re-tapping the right TV.
    if (this.handSkuId === ticket.skuId) this.shopClick({ type: "bagRack" });
    else this.shopClick({ type: "item", skuId: ticket.skuId });
    return true;
  }

  private tickTimers(): void {
    // Copy — failOrder archives (splices) mid-loop.
    for (const order of [...this.orders]) {
      if (order.type === "pickup" && order.slaStartGameMs !== undefined && isOpen(order)) {
        const elapsed = this.clock.gameMs - order.slaStartGameMs;
        if (order.status === "onPickupShelf") {
          if (elapsed >= PICKUP_ARRIVE_MS) {
            order.status = "readyForHandoff";
            if (!this.customers.some((c) => c.orderId === order.id)) {
              this.customers.push(this.newCustomer(order.id, "pickup"));
            }
            if (this.playerRole === "keyLead") {
              this.setOrdersNotice(`${order.customerName} is here for pickup.`);
            } else {
              this.toast = `${order.customerName} is here for pickup.`;
            }
            this.touch();
          }
        } else if (order.status === "readyForHandoff") {
          if (order.arriveAtGameMs === undefined) {
            const walkStarted = order.slaStartGameMs + PICKUP_ARRIVE_MS;
            if (this.clock.gameMs - walkStarted >= INSTORE_WALKOUT_MS) {
              this.failOrder(order, "Pickup no-show.");
              continue;
            }
          } else if (this.clock.gameMs - order.arriveAtGameMs >= PICKUP_HANDOFF_WAIT_MS) {
            this.failOrder(order, "Pickup no-show.");
            continue;
          }
        }
      }
      if (order.type === "inStore" && order.status === "atRegister" && order.arriveAtGameMs !== undefined) {
        if (this.clock.gameMs - order.arriveAtGameMs >= INSTORE_WALKOUT_MS) {
          this.failOrder(order, "Customer walked out.");
        }
      }
    }
  }

  private tickSpawns(): void {
    if (!this.autoSpawn) return;
    this.spawnQueue = this.spawnQueue.filter((event) => {
      if (this.clock.gameMs >= event.atMs) {
        this.spawnOrder(event.type, { destinationId: event.destinationId });
        this.lastAutoSpawn = this.clock.gameMs;
        return false;
      }
      return true;
    });
    if (this.clock.gameMs >= this.nextTicketWaveAt) {
      this.spawnTicketWave();
      const wait = TICKET_WAVE_MIN_MS + Math.floor(this.rng() * (TICKET_WAVE_MAX_MS - TICKET_WAVE_MIN_MS + 1));
      this.nextTicketWaveAt = this.clock.gameMs + wait;
    }
    if (this.clock.gameMs >= this.nextWalkInAt) {
      this.spawnWalkIn();
      const wait = WALKIN_GAP_MIN_MS + Math.floor(this.rng() * (WALKIN_GAP_MAX_MS - WALKIN_GAP_MIN_MS + 1));
      this.nextWalkInAt = this.clock.gameMs + wait;
    }
  }

  private spawnTicketWave(): void {
    const room = TABLET_QUEUE_MAX - tabletQueue(this.orders).length;
    if (room <= 0) return;
    const n = Math.min(room, this.rng() < 0.5 ? 1 : 2);
    for (let i = 0; i < n; i++) {
      const type: OrderType = this.rng() < 0.5 ? "pickup" : "delivery";
      this.spawnOrder(type);
    }
  }

  /**
   * The front door keeps opening all day. Only one walk-in stands at the counter at a
   * time: there is a single customer spot, and an ignored walk-in leaves in
   * INSTORE_WALKOUT_MS, so a queue of them would be a pile-up no player could clear.
   * A beat that lands on an occupied counter is dropped and re-armed — the same way a
   * ticket wave is dropped when the tablet is full — so a slow counter thins its own
   * traffic instead of burying the player.
   *
   * The rate does not change with the player's role. The door does not know whether the
   * van is out; what changes is who answers it, which is exactly the key lead's job.
   */
  private spawnWalkIn(): void {
    if (this.orders.some((o) => o.type === "inStore" && isOpen(o))) return;
    this.spawnOrder("inStore");
  }

  private tabletFront(): Order | undefined {
    const claimed = this.claimedTicketIds();
    return tabletQueue(this.orders).find((order) => !claimed.has(order.id));
  }

  private keyLeadCallout(selected: Order | undefined): string | null {
    // Holding / Grabbing attach to the key lead (or held item) instead of the toast chip.
    if (this.keyLeadPhase !== "idle" && this.fetchSkuId) {
      const sku = skuById(this.catalog, this.fetchSkuId);
      return `Grabbing ${sku?.name ?? "it"}…`;
    }
    if (this.handSkuId) {
      const sku = skuById(this.catalog, this.handSkuId);
      const name = sku?.name ?? "it";
      return this.selectedTicket() ? `Holding ${name}. Tap a bag` : `Holding ${name}`;
    }
    if (!selected || selected.type === "inStore") return null;
    const sku = skuById(this.catalog, selected.skuId);
    if (!sku) return null;
    return `${selected.type === "pickup" ? "Pickup" : "Delivery"}: ${sku.name} for ${selected.customerName}`;
  }

  private toViewOrNull(order: Order | undefined): OrderView | null {
    return order ? this.toView(order) : null;
  }

  private interactDriver(): void {
    if (this.shiftEnded) return;
    // Stay locked on an in-progress curb/door stop — never rebind mid-handoff.
    if (this.dropoff && this.dropoff.phase !== "atCurb") {
      this.continueDropoff();
      return;
    }

    const stopId = this.nextStopId();
    if (!stopId) {
      this.toast = headBackToShopToast();
      return;
    }
    const house = houseById(stopId);
    if (!house) return;
    const pos = tileToWorld(house.stop);
    const atCurb = dist(this.vehicle.x, this.vehicle.y, pos.x, pos.y) <= HANDOFF_RADIUS;

    if (!this.dropoff || this.dropoff.houseId !== stopId) {
      if (!atCurb) {
        this.toast = `Park at ${houseTitle(stopId)}.`;
        return;
      }
      this.beginCurb(stopId);
    }

    this.continueDropoff();
  }

  private continueDropoff(): void {
    const d = this.dropoff;
    if (!d) return;
    if (!this.dropoffConfirmAccepts()) return;

    if (d.phase === "atCurb") {
      d.phase = "calling";
      d.callDoneAt = this.clock.gameMs + CALL_CONNECT_MS;
      this.toast = `Calling ${this.orderById(d.orderId)?.customerName ?? "customer"}…`;
      this.armDropoffInteract();
      return;
    }
    if (d.phase === "calling") {
      this.toast = "Phone is ringing…";
      return;
    }

    if (d.phase !== "atDoor") return;

    const order = this.orderById(d.orderId);
    if (!order || order.status !== "onRun") {
      this.clearDropoff();
      this.refreshDriveRoute();
      return;
    }

    if (!d.idAsked) {
      d.idAsked = true;
      this.toast = `${order.customerName} is showing ID. Check the name matches the order.`;
      this.armDropoffInteract();
      return;
    }

    const card = idCardFor(order.customerName, order.idAge, order.idMatches);
    if (!d.idChecked) {
      if (!card.matches) {
        this.failOrder(order, `ID check failed — the name doesn't match ${order.customerName}'s order.`, {
          idMismatch: true,
        });
        this.refreshDriveRoute();
        this.toast =
          this.runOrderIds.length === 0
            ? deniedReturnToShopToast(SCORE_FAIL)
            : deniedNextStopToast(
                SCORE_FAIL,
                this.nextStopId() ? houseTitle(this.nextStopId()!) : null,
              );
        this.armDropoffInteract();
        return;
      }
      d.idChecked = true;
      this.toast = `ID matches the order. Hand ${order.customerName} the bag.`;
      this.releaseDropoffConfirm();
      // Full cooldown so the ID tap cannot click through into bag/photo.
      this.armDropoffInteract(NPC_INTERACT_COOLDOWN_MS);
      return;
    }
    if (!d.bagHanded) {
      d.bagHanded = true;
      this.toast = `Bag handed to ${order.customerName}. Snap the photo.`;
      this.armDropoffInteract();
      return;
    }
    if (!d.photoTaken) {
      if (!d.bagHanded) return;
      d.photoTaken = true;
      this.complete(order);
      this.runOrderIds = this.runOrderIds.filter((id) => id !== order.id);
      this.clearDropoff();
      this.refreshDriveRoute();
      const dropMsg = order.late
        ? `Late drop (${SCORE_DELIVERY_LATE})`
        : `On-time (+${SCORE_DELIVERY_ON_TIME})`;
      if (this.runOrderIds.length === 0) {
        this.toast = dropReturnToShopToast(dropMsg);
      } else {
        this.toast = dropNextStopToast(
          dropMsg,
          this.nextStopId() ? houseTitle(this.nextStopId()!) : null,
        );
      }
      this.armDropoffInteract();
    }
  }

  private armDropoffInteract(ms = Math.min(220, NPC_INTERACT_COOLDOWN_MS)): void {
    this.dropoffGate = latchDropoffGate(this.clock.gameMs, ms);
  }

  private driverDropoffGated(): boolean {
    return this.playerRole === "driver" && !!this.dropoff;
  }

  private dropoffConfirmAccepts(): boolean {
    return dropoffGateAccepts(this.dropoffGate, this.clock.gameMs);
  }

  private beginCurb(stopId: string): void {
    const order = this.runOrderIds
      .map((id) => this.orderById(id))
      .find((o) => o?.destinationId === stopId && o.status === "onRun");
    if (!order) return;
    this.dropoff = {
      orderId: order.id,
      houseId: stopId,
      phase: "atCurb",
      customer: null,
      driver: null,
      photoTaken: false,
      idAsked: false,
      idChecked: false,
      bagHanded: false,
    };
  }

  private clearDropoff(): void {
    this.dropoff = null;
    this.dropoffGate = null;
    this.dropoffConfirmHeld = false;
  }

  private syncCurb(): void {
    if (this.playerRole !== "driver") return;
    if (this.dropoff && this.dropoff.phase !== "atCurb") return;
    const stopId = this.nextStopId();
    if (!stopId) {
      this.dropoff = null;
      return;
    }
    const house = houseById(stopId);
    if (!house) return;
    const pos = tileToWorld(house.stop);
    const atCurb = dist(this.vehicle.x, this.vehicle.y, pos.x, pos.y) <= HANDOFF_RADIUS;
    if (atCurb) {
      if (!this.dropoff || this.dropoff.houseId !== stopId) this.beginCurb(stopId);
    } else if (this.dropoff?.phase === "atCurb") {
      this.dropoff = null;
    }
  }

  private tickCall(): void {
    const d = this.dropoff;
    if (!d || d.phase !== "calling" || d.callDoneAt === undefined) return;
    if (this.clock.gameMs < d.callDoneAt) return;
    const house = houseById(d.houseId);
    if (!house) return;
    const door = doorstepWorld(house);
    d.phase = "atDoor";
    d.customer = { x: door.x, y: door.y, targetX: door.x, targetY: door.y };
    d.driver = { x: door.x, y: door.y };
    this.toast = `${this.orderById(d.orderId)?.customerName ?? "Customer"} is at the door.`;
  }

  private toDropoffView(): DropoffView {
    const d = this.dropoff;
    if (!d || this.playerRole !== "driver") return emptyDropoff();
    const order = this.orderById(d.orderId);
    const sku = order ? skuById(this.catalog, order.skuId) : undefined;
    const arrived = !!d.customer && d.customer.x === d.customer.targetX && d.customer.y === d.customer.targetY;
    let actionLabel = "";
    let canAct = false;
    let hint = order ? `Park at ${destLabel(order)} — ${order.customerName}.` : "Park on the pin.";
    if (d.phase === "atCurb") {
      actionLabel = "CALL";
      canAct = true;
      hint = `Tap your phone to call ${order?.customerName ?? "the customer"}.`;
    } else if (d.phase === "calling") {
      actionLabel = "RINGING";
      hint = `Calling ${order?.customerName ?? "customer"}…`;
    } else if (d.phase === "atDoor" && !d.idAsked) {
      actionLabel = "ASK ID";
      canAct = true;
      hint = `Tap ${order?.customerName ?? "the customer"} to ask for ID.`;
    } else if (d.phase === "atDoor" && !d.idChecked) {
      actionLabel = "CHECK ID";
      canAct = true;
      hint = `Tap the ID card to confirm it matches ${order ? `${order.customerName}'s` : "the"} order.`;
    } else if (d.phase === "atDoor" && !d.bagHanded) {
      actionLabel = "HAND BAG";
      canAct = true;
      hint = `Tap the bag to hand it to ${order?.customerName ?? "them"}.`;
    } else if (d.phase === "atDoor") {
      actionLabel = "PHOTO";
      canAct = true;
      hint = `Tap the bag in their hands to take the photo.`;
    }
    const interactArmed = this.dropoffConfirmAccepts();
    if (!interactArmed) canAct = false;
    return {
      phase: d.phase,
      orderId: d.orderId,
      houseId: d.houseId,
      customerName: order?.customerName ?? null,
      customerLook: order ? customerLookIndex(order.customerName, order.idAge) : null,
      skuName: sku?.name ?? null,
      atCurb: d.phase === "atCurb",
      driverOnFoot: false,
      driver: d.driver ? { ...d.driver } : null,
      customer: d.customer ? { x: d.customer.x, y: d.customer.y, arrived } : null,
      photoTaken: d.photoTaken,
      idAsked: d.idAsked,
      idChecked: d.idChecked,
      bagHanded: d.bagHanded,
      actionLabel,
      canAct,
      hint,
      idCard:
        d.phase === "atDoor" && d.idAsked && !d.idChecked && order
          ? idCardFor(order.customerName, order.idAge, order.idMatches)
          : null,
      interactArmed,
    };
  }

  private serveLine(): string {
    if (this.playerRole === "driver") {
      const stopId = this.nextStopId();
      const order = this.runOrderIds
        .map((id) => this.orderById(id))
        .find((o) => o?.destinationId === stopId && o.status === "onRun");
      if (order) {
        const sku = skuById(this.catalog, order.skuId);
        return `→  ${destLabel(order)}   ·   ${order.customerName}   ·   ${sku?.name ?? ""}   ·   ${this.runOrderIds.length} bag${this.runOrderIds.length === 1 ? "" : "s"}`;
      }
      return headBackToShopHint();
    }
    const order = this.focusOrder();
    if (!order) return "No open tickets";
    const sku = skuById(this.catalog, order.skuId);
    if (order.type === "inStore") {
      if (this.handSkuId === order.skuId) return `HANDOFF  Counter  ·  tap ${order.customerName}`;
      return `COUNTER  ·  ${order.customerName} wants ${sku?.name ?? ""} — tap that TV`;
    }
    if (order.type === "pickup" && order.status === "readyForHandoff") {
      return `HANDOFF  Pickup  ·  tap ${order.customerName}`;
    }
    if (needsFetch(order) && this.selectedOrderId === order.id) {
      if (this.keyLeadPhase !== "idle") return `BACK ROOM  ·  grabbing ${sku?.name ?? ""}`;
      if (this.handSkuId === order.skuId) return `BAG  ·  tap a bag to pack ${sku?.name ?? ""}`;
      return `TV  ·  tap ${sku?.name ?? ""} on the wall`;
    }
    if (order.type === "pickup") {
      return `PICKUP  ·  ${order.customerName}  ·  ${sku?.name ?? ""} — tap ticket, then the item, then a bag`;
    }
    if (order.status === "queued") {
      return `DELIVER  ${destLabel(order)}  ·  ${order.customerName}  ·  ${sku?.name ?? ""} — tap ticket, then the item, then a bag`;
    }
    return `DELIVER  ${destLabel(order)}  ·  ${order.customerName}  ·  ${sku?.name ?? ""}`;
  }

  private focusOrder(): Order | undefined {
    if (this.selectedOrderId) {
      const selected = this.orderById(this.selectedOrderId);
      if (selected && isOpen(selected) && selected.type !== "inStore") return selected;
    }
    const instore = this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    if (instore) return instore;
    return this.orders.find((o) => o.status === "readyForHandoff" || o.status === "inBin" || o.status === "onRun");
  }

  private focusSkuId(): string | null {
    if (this.keyLeadPhase !== "idle") return null;
    if (this.handSkuId) return null;
    const instore = this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    if (instore && this.customerAtCounter(instore.id)) return instore.skuId;
    const ticket = this.selectedTicket();
    if (ticket) return ticket.skuId;
    return null;
  }

  private complete(order: Order): void {
    if (this.shiftEnded) return;
    if (order.type === "delivery" && this.dropoff) {
      if (!this.dropoff.bagHanded || !this.dropoff.photoTaken) return;
    }
    this.touch();
    order.status = "completed";
    if (order.type === "delivery") order.late = isDeliveryLate(order, this.clock.gameMs);
    if (this.playerRole === "driver" && order.type !== "delivery") this.coverServed += 1;
    const delta = scoreForComplete(order, this.clock.gameMs);
    this.score += delta;
    this.pushScoreFlash(delta, this.scorePopAnchor(order));
    this.scoredActions += 1;
    this.customers = this.customers.filter((c) => c.orderId !== order.id);
    if (this.selectedOrderId === order.id) this.selectedOrderId = null;
    this.dropQueuedTicket(order.id);
    const sku = skuById(this.catalog, order.skuId);
    this.clearCustomerFeedback(order.id);
    if (order.type === "delivery" && order.late) {
      this.toast = `Late drop (−${Math.abs(SCORE_DELIVERY_LATE)}): ${sku?.name}.`;
    } else if (order.type === "delivery") {
      this.toast = `On-time drop (+${SCORE_DELIVERY_ON_TIME}): ${sku?.name} to ${order.customerName}!`;
    } else if (this.playerRole === "keyLead") {
      // Score plate pop owns the delta; no bottom chip during counter play.
      this.toast = "";
    } else {
      this.toast = `Sold ${sku?.name ?? "item"} to ${order.customerName}! (+${delta})`;
    }
    this.pushSfx("sell");
    this.archiveTerminalOrder(order);
  }

  private failOrder(order: Order, reason: string, opts: { idMismatch?: boolean } = {}): void {
    if (this.shiftEnded) return;
    this.touch();
    order.status = "failed";
    if (this.playerRole === "driver" && order.type !== "delivery") {
      this.coverLost += 1;
      this.coverLostName = order.customerName;
      this.coverLostAt = this.clock.gameMs;
    }
    const delta = scoreForFail();
    this.score += delta;
    this.pushScoreFlash(delta, this.scorePopAnchor(order));
    this.scoredActions += 1;
    if (opts.idMismatch) this.idMismatchFails += 1;
    this.customers = this.customers.filter((c) => c.orderId !== order.id);
    if (this.selectedOrderId === order.id) this.selectedOrderId = null;
    this.dropQueuedTicket(order.id);
    this.advancePackQueue();
    this.runOrderIds = this.runOrderIds.filter((id) => id !== order.id);
    if (this.dropoff?.orderId === order.id) this.clearDropoff();
    // Drop leftover fetch/hand when this order (or its SKU) was in flight — avoids ghost items after walkout.
    if (
      order.type === "inStore" ||
      this.fetchSkuId === order.skuId ||
      this.handSkuId === order.skuId
    ) {
      this.handSkuId = null;
      this.fetchSkuId = null;
      this.keyLeadPhase = "idle";
      this.keyLeadX = KEYLEAD.x;
      this.keyLeadFacing = 1;
      this.backroomLeftMs = 0;
    }
    this.clearCustomerFeedback(order.id);
    if (this.playerRole === "keyLead") {
      this.toast = "";
      this.setOrdersNotice(`${reason} (${delta})`);
    } else {
      this.toast = `${reason} (${delta})`;
    }
    this.pushSfx("deny");
    this.archiveTerminalOrder(order);
  }

  /** Drop terminal orders from the per-frame hot list; shift results read shiftLedger. */
  private archiveTerminalOrder(order: Order): void {
    const idx = this.orders.indexOf(order);
    if (idx < 0) return;
    this.orders.splice(idx, 1);
    this.shiftLedger.push(order);
  }

  private scorePopAnchor(order: Order): ScorePopAnchor {
    if (this.playerRole === "driver") {
      const drop = this.dropoff;
      if (drop?.phase === "atDoor" && drop.customer) {
        return { x: drop.customer.x, y: drop.customer.y, space: "door" };
      }
      return { x: this.vehicle.x, y: this.vehicle.y, space: "drive" };
    }
    const customer = this.customers.find((c) => c.orderId === order.id);
    const headY = CUSTOMER_SPOT.y - PERSON_DISPLAY_MAX_H * 0.55;
    return {
      x: customer?.x ?? CUSTOMER_SPOT.x,
      y: headY,
      space: "shop",
    };
  }

  private pushScoreFlash(delta: number, anchor: ScorePopAnchor): void {
    this.touch();
    this.scoreFlashSeq += 1;
    this.scoreFlash = { id: this.scoreFlashSeq, delta, anchor };
  }

  private pushSfx(kind: SfxKind): void {
    this.touch();
    this.sfxSeq += 1;
    this.sfxCue = { id: this.sfxSeq, kind };
  }


  /** Shop cues that name a customer land in their side stack, not the toast chip. */
  private setCustomerFeedback(orderId: string, text: string): void {
    if (this.customerFeedback.get(orderId) === text) return;
    this.touch();
    this.customerFeedback.set(orderId, text);
  }

  private clearCustomerFeedback(orderId: string): void {
    if (!this.customerFeedback.has(orderId)) return;
    this.touch();
    this.customerFeedback.delete(orderId);
  }

  /** Wrong-TV / item cue near the tapped item; cleared on the next successful fetch. */
  private setTargetCallout(skuId: string, text: string): void {
    const cur = this.targetCallout;
    if (cur?.skuId === skuId && cur.text === text) return;
    this.touch();
    this.targetCallout = { skuId, text };
  }

  private clearTargetCallout(): void {
    if (this.targetCallout == null) return;
    this.touch();
    this.targetCallout = null;
  }

  /** Light ORDERS tablet notice for ticket spawn / pack events during shop play. */
  private setOrdersNotice(text: string): void {
    if (this.ordersNotice === text) return;
    this.touch();
    this.ordersNotice = text;
  }

  private customerX(orderId: string): number | undefined {
    return this.customers.find((c) => c.orderId === orderId)?.x;
  }

  private customerAtCounter(orderId: string): boolean {
    const customer = this.customers.find((c) => c.orderId === orderId);
    if (!customer) return false;
    return Math.abs(customer.x - customer.targetX) <= 24;
  }

  private nextHouse(): string {
    const houses = CITY.houses;
    const house = houses[this.nextDeliveryHouse % houses.length]!;
    this.nextDeliveryHouse += 1;
    return house.id;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function mulberryFrom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function gpsPath(sim: GameSim): WorldPoint[] {
  const snap = sim.snapshot();
  const from = worldToTile(snap.vehicle.x, snap.vehicle.y);
  const start = CITY.walkable[from.r]?.[from.c] ? from : CITY.shopSpawn;
  const stopId = snap.run?.nextStopId;
  if (stopId) {
    const house = houseById(stopId);
    if (!house) return [];
    return routeWorldPoints(findPath(CITY.walkable, start, house.stop));
  }
  if (snap.playerRole !== "driver") return [];
  return routeWorldPoints(findPath(CITY.walkable, start, CITY.shopSpawn));
}

export type { HouseStop };
export type { DropoffView } from "./dropoff";
