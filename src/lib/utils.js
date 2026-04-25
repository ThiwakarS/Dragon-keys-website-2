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
  'delivered',
  'cancelled',
];

export const STATUS_LABELS = {
  awaiting_deposit:      'Awaiting Deposit',
  in_queue:              'In Queue',
  printing:              'Printing',
  awaiting_final_payment:'Awaiting Final Payment',
  shipped:               'Shipped',
  delivered:             'Delivered',
  cancelled:             'Cancelled',
};

// Statuses that count a user as having an "active" order
export const ACTIVE_STATUSES = [
  'awaiting_deposit',
  'in_queue',
  'printing',
  'awaiting_final_payment',
];

// Statuses where the USER can self-cancel (before printing starts)
export const USER_CANCELLABLE_STATUSES = [
  'awaiting_deposit',
  'in_queue',
];

// Statuses where the order is "done" — no more changes expected
export const TERMINAL_STATUSES = ['delivered', 'cancelled'];

/**
 * ETA calculator.
 */
export function calculateEta(productId, positionInProductQueue) {
  const product = findProduct(productId);
  if (!product || !product.throughputPerDay || positionInProductQueue < 1) {
    return { days: 0, shipDate: new Date() };
  }
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

export function isValidPincode(pincode) {
  return /^\d{6}$/.test(pincode);
}

export function isValidWhatsApp(num) {
  const cleaned = String(num).replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

export function isAdmin(user) {
  return user?.publicMetadata?.role === 'admin';
}