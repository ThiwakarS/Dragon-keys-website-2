/* =============================================
   Utility functions
   ============================================= */

import { findProduct } from '../data/products.js';

// All valid order statuses — keep in sync with the Postgres enum
export const ORDER_STATUSES = [
  'awaiting_deposit',
  'in_queue',
  'printing',
  'awaiting_final_payment',
  'shipped',
  'cancelled',
];

export const STATUS_LABELS = {
  awaiting_deposit: 'Awaiting Deposit',
  in_queue: 'In Queue',
  printing: 'Printing',
  awaiting_final_payment: 'Awaiting Final Payment',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
};

// Statuses that count a user as having an "active" order (blocks new bookings)
export const ACTIVE_STATUSES = [
  'awaiting_deposit',
  'in_queue',
  'printing',
  'awaiting_final_payment',
];

/**
 * ETA calculator.
 *
 * Each product has `throughputPerDay` (how many the maker produces daily).
 * The global queue position for a user's order among active (non-shipped,
 * non-cancelled) orders of the same product determines how many orders
 * must be completed before theirs.
 *
 * - positionInProductQueue: 1-indexed position (1 = next up, 2 = second, ...)
 * - returns { days, shipDate } — days is a positive integer, shipDate is a Date
 */
export function calculateEta(productId, positionInProductQueue) {
  const product = findProduct(productId);
  if (!product || !product.throughputPerDay || positionInProductQueue < 1) {
    return { days: 0, shipDate: new Date() };
  }

  // Days until this order ships. Position 1 (next up) still takes 1/throughput days.
  const days = Math.ceil(positionInProductQueue / product.throughputPerDay);
  const shipDate = new Date();
  shipDate.setDate(shipDate.getDate() + days);
  return { days, shipDate };
}

export function formatShipDate(date) {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Indian pincode — exactly 6 digits */
export function isValidPincode(pincode) {
  return /^\d{6}$/.test(pincode);
}

/** WhatsApp phone — country code + number, digits only, 10-15 long */
export function isValidWhatsApp(num) {
  const cleaned = String(num).replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/** Admin role check — from Clerk's public metadata */
export function isAdmin(user) {
  return user?.publicMetadata?.role === 'admin';
}
