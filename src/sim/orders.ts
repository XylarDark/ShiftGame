export type OrderType = "pickup" | "inStore" | "delivery";

export type OrderStatus =
  | "queued"
  | "carrying"
  | "onPickupShelf"
  | "readyForHandoff"
  | "inBin"
  | "onRun"
  | "atRegister"
  | "completed"
  | "failed";

export interface Order {
  id: string;
  type: OrderType;
  skuId: string;
  status: OrderStatus;
  createdAtGameMs: number;
  slaStartGameMs?: number;
  /** Packed while the van was out — the courier hour waits for a driver to be back. */
  slaDeferred?: boolean;
  arriveAtGameMs?: number;
  destinationId?: string;
  customerName: string;
  /** Printed ID age, frozen at spawn. Feeds the card's DOB and the customer's look. */
  idAge: number;
  /** Frozen at spawn: whether the doorstep ID's name matches this order. */
  idMatches: boolean;
  late?: boolean;
}

export function destLabel(order: Pick<Order, "type" | "destinationId">): string {
  if (order.type === "inStore") return "Counter";
  if (order.type === "pickup") return "Pickup";
  if (order.destinationId) return `House ${order.destinationId.replace("house-", "")}`;
  return "Delivery";
}

export function needsFetch(order: Order): boolean {
  return order.status === "queued" || order.status === "atRegister";
}

export function isOpen(order: Order): boolean {
  return order.status !== "completed" && order.status !== "failed";
}

export function isTabletTicket(order: Pick<Order, "type" | "status">): boolean {
  return order.type !== "inStore" && order.status === "queued";
}

/** Packed pickup or delivery bags that sit on the shop counter. */
export function isPackedOnCounter(order: Pick<Order, "status">): boolean {
  return order.status === "onPickupShelf" || order.status === "readyForHandoff" || order.status === "inBin";
}

export function tabletQueue<T extends Pick<Order, "type" | "status" | "createdAtGameMs" | "id">>(orders: T[]): T[] {
  return orders
    .filter(isTabletTicket)
    .sort((a, b) => a.createdAtGameMs - b.createdAtGameMs || a.id.localeCompare(b.id));
}
