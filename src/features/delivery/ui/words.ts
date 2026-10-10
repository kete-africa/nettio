import type { TagTone } from '@kete/design';
import * as m from '@/paraglide/messages.js';
import type { DeliveryKind, DeliveryStatus } from '../domain/delivery';

export const deliveryKindWords: Record<DeliveryKind, () => string> = {
  collect: m.trip_kind_collect,
  deliver: m.trip_kind_deliver,
};

export const deliveryStatusWords: Record<DeliveryStatus, () => string> = {
  planned: m.trip_status_planned,
  out: m.trip_status_out,
  done: m.trip_status_done,
  failed: m.trip_status_failed,
  cancelled: m.trip_status_cancelled,
};

export const deliveryStatusTones: Record<DeliveryStatus, TagTone> = {
  planned: 'neutral',
  out: 'neutral',
  done: 'validated',
  failed: 'error',
  cancelled: 'neutral',
};
