import type { SiteSettings } from './settings';

// Delivery helpers shared by the server (quotes) and the checkout page.

/** Pickup points (lockers, Pargo, PAXI…) as opposed to a courier to the door. */
export const PICKUP = /pargo|locker|bob ?box|click ?& ?collect|collect|pick ?up|paxi|pudo/i;
export const isPickupName = (name: string) => PICKUP.test(name);

/** True when this pack size gets free delivery. 0 or empty = free delivery is off. */
export const freeDelivery = (s: Pick<SiteSettings, 'freeShipMinQty'>, qty: number) => (s.freeShipMinQty || 0) > 0 && qty >= s.freeShipMinQty;

type R = { service_name: string; total_price: number; full_price?: number };

/**
 * Free delivery: the cheapest courier-to-door option becomes R0 (or the cheapest pickup if there is no door option),
 * and every other option costs only the difference over it. full_price keeps what the courier actually charges the shop.
 */
export function applyFreeDelivery<T extends R>(rates: T[]): T[] {
  if (!rates.length) return rates;
  const door = rates.filter((r) => !isPickupName(r.service_name));
  const base = (door.length ? door : rates).reduce((a, b) => (b.total_price < a.total_price ? b : a));
  return rates.map((r) => ({ ...r, full_price: r.total_price, total_price: r === base ? 0 : Math.max(0, Math.round(r.total_price - base.total_price)) }));
}
