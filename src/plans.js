import { config } from './config.js';

const PLANS = [
  { id: 'monthly', name: 'Monthly', every: 'a month', days: 30, recurring: { interval: 'month', interval_count: 1 } },
  { id: 'biweekly', name: 'Every 2 weeks', every: 'every 2 weeks', days: 14, recurring: { interval: 'week', interval_count: 2 } },
];

const SYMBOLS = { USD: '$', INR: '₹', CAD: 'C$', AUD: 'A$', EUR: '€', GBP: '£' };

export function plans() {
  return PLANS.map((p) => ({ ...p, amount: config.billing[p.id] })).filter((p) => p.amount > 0);
}

export function planById(id) {
  return plans().find((p) => p.id === id) || null;
}

export function money(amount, currency = config.billing.currency) {
  const value = amount / 100;
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return SYMBOLS[currency] ? `${SYMBOLS[currency]}${text}` : `${currency} ${text}`;
}

export function priceLabel() {
  return config.billing.priceLabel || plans().map((p) => `${money(p.amount)} ${p.every}`).join(' or ');
}
