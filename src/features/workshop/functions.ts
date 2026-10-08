import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { perform } from '@/platform/screen';
import type { WorkshopQueue } from './capabilities';
import { advanceInput, incidentInput, resolveInput } from './work.record';
import type { Incident, WorkUnit } from './infrastructure/units';

const key = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/);

export const fetchQueue = createServerFn({ method: 'GET' }).handler(async () => {
  const queue = await perform<WorkshopQueue>('workshop_queue', {});
  const incidents = await perform<Incident[]>('workshop_incidents', {});
  return queue.ok ? { queue: queue.output, incidents: incidents.ok ? incidents.output : [] } : null;
});

export const fetchWork = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ orderId: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const read = await perform<{ units: WorkUnit[]; incidents: Incident[] }>('workshop_order', data);
    return read.ok ? read.output : null;
  });

export const advanceUnit = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ key, step: advanceInput }).parse(input))
  .handler(({ data }) =>
    perform<{ done: string; next: string | null; orderReady: boolean; number: string }>(
      'workshop_advance',
      data.step,
      data.key,
    ),
  );

export const reportUnitIncident = createServerFn({ method: 'POST' })
  .validator((input: unknown) => incidentInput.parse(input))
  .handler(({ data }) => perform<{ incidentId: string }>('workshop_report_incident', data));

export const resolveUnitIncident = createServerFn({ method: 'POST' })
  .validator((input: unknown) => resolveInput.parse(input))
  .handler(({ data }) => perform<{ incidentId: string }>('workshop_resolve_incident', data));
