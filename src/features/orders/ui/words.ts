import type { TagTone } from '@kete/design';
import * as m from '@/paraglide/messages.js';
import type { OrderStatus, PaymentKind, PaymentMethod } from '../domain/order';

// The words of deposits and of their money, in the person's language.

export const statusWords: Record<OrderStatus, () => string> = {
  received: m.order_state_received,
  in_progress: m.order_state_in_progress,
  ready: m.order_state_ready,
  collected: m.order_state_collected,
  cancelled: m.order_state_cancelled,
};

/** A state reads by its word; the tone only helps the eye. */
export const statusTones: Record<OrderStatus, TagTone> = {
  received: 'info',
  in_progress: 'info',
  ready: 'verify',
  collected: 'validated',
  cancelled: 'neutral',
};

export const methodWords: Record<PaymentMethod, () => string> = {
  cash: m.method_cash,
  mobile_money: m.method_mobile_money,
  card: m.method_card,
  transfer: m.method_transfer,
};

export const kindWords: Record<PaymentKind, () => string> = {
  deposit: m.payment_kind_deposit,
  balance: m.payment_kind_balance,
  refund: m.payment_kind_refund,
};

export const eventWords: Record<string, () => string> = {
  received: m.order_event_received,
  in_progress: m.order_state_in_progress,
  incident: m.order_event_incident,
  stored: m.order_event_stored,
  paid: m.order_event_paid,
  ready: m.order_event_ready,
  collected: m.order_event_collected,
  cancelled: m.order_event_cancelled,
  refunded: m.order_event_refunded,
};
