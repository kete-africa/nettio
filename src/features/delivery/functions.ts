import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { perform } from '@/platform/screen';
import type { DeliveryBoard } from './capabilities';
import {
  assignInput,
  boardInput,
  completeInput,
  deliveryRef,
  failInput,
  ofOrderInput,
  planInput,
  zoneInput,
} from './delivery.record';
import type { Delivery, Zone } from './infrastructure/delivery.tables';

const key = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/);

export const fetchBoard = createServerFn({ method: 'GET' })
  .validator((input: unknown) => boardInput.parse(input))
  .handler(async ({ data }) => {
    const read = await perform<DeliveryBoard>('delivery_board', data);
    return read.ok ? read.output : null;
  });

export const fetchDeliveriesOf = createServerFn({ method: 'GET' })
  .validator((input: unknown) => ofOrderInput.parse(input))
  .handler(async ({ data }) => {
    const read = await perform<{ trips: Delivery[]; zones: Zone[]; last: { address: string; zoneId: string } | null }>(
      'delivery_of_order',
      data,
    );
    return read.ok ? read.output : null;
  });

export const fetchDelivery = createServerFn({ method: 'GET' })
  .validator((input: unknown) => deliveryRef.parse(input))
  .handler(async ({ data }) => {
    const read = await perform<Delivery | null>('delivery_get', data);
    return read.ok ? read.output : null;
  });

export const saveZone = createServerFn({ method: 'POST' })
  .validator((input: unknown) => zoneInput.parse(input))
  .handler(({ data }) => perform<{ zoneId: string }>('delivery_set_zone', data));

export const planTrip = createServerFn({ method: 'POST' })
  .validator((input: unknown) => planInput.parse(input))
  .handler(({ data }) => perform<{ deliveryId: string; fee: number; zone: string }>('delivery_plan', data));

export const assignTrip = createServerFn({ method: 'POST' })
  .validator((input: unknown) => assignInput.parse(input))
  .handler(({ data }) => perform<{ deliveryId: string }>('delivery_assign', data));

export const cancelTrip = createServerFn({ method: 'POST' })
  .validator((input: unknown) => deliveryRef.parse(input))
  .handler(({ data }) => perform<{ deliveryId: string; fee: number }>('delivery_cancel', data));

export const startTrip = createServerFn({ method: 'POST' })
  .validator((input: unknown) => deliveryRef.parse(input))
  .handler(({ data }) => perform<{ deliveryId: string; customerTold: boolean }>('delivery_start', data));

export const completeTrip = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ key, proof: completeInput }).parse(input))
  .handler(({ data }) =>
    perform<{ deliveryId: string; number: string | null; cashed: number }>('delivery_complete', data.proof, data.key),
  );

export const failTrip = createServerFn({ method: 'POST' })
  .validator((input: unknown) => failInput.parse(input))
  .handler(({ data }) => perform<{ deliveryId: string }>('delivery_fail', data));
