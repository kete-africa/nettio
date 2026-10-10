import { Button, PageSection, Tag, TextField } from '@kete/design';
import { useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { errorSentence } from '@/lib/errors';
import { ErrorNote, Note, SelectField } from '@/lib/fields';
import { currentDay, formatDay, formatMoney } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import { isOpen } from '../domain/delivery';
import { cancelTrip, fetchDeliveriesOf, planTrip } from '../functions';
import { deliveryStatusTones, deliveryStatusWords } from './words';

type View = NonNullable<Awaited<ReturnType<typeof fetchDeliveriesOf>>>;

/**
 * On a deposit's page (specs/027-delivery): bring it back to its customer — a zone, an address,
 * a day. The zone's fee joins the deposit's price at once.
 */
export function OrderDelivery({ orderId, open, mayPlan }: { orderId: string; open: boolean; mayPlan: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [planning, setPlanning] = useState(false);
  const [zoneId, setZoneId] = useState('');
  const [address, setAddress] = useState('');
  const [day, setDay] = useState(currentDay());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const read = useCallback(async () => {
    const next = await fetchDeliveriesOf({ data: { orderId } });
    setView(next);
    if (next) {
      setZoneId((current) => current || next.last?.zoneId || next.zones[0]?.zoneId || '');
      setAddress((current) => current || next.last?.address || '');
    }
  }, [orderId]);
  useEffect(() => {
    void read();
  }, [read]);

  if (!view) return null;
  const under = view.trips.find((trip) => isOpen(trip.status));
  // Nothing to show on a deposit that was never delivered and can no longer be.
  if (view.trips.length === 0 && (!open || !mayPlan)) return null;
  const zone = view.zones.find((each) => each.zoneId === zoneId);

  async function run(work: () => Promise<{ ok: boolean; code?: string }>, done: string) {
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      const outcome = await work();
      if (!outcome.ok) return setError(errorSentence(outcome.code ?? ''));
      await Promise.all([read(), router.invalidate()]);
      setPlanning(false);
      setSaid(done);
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageSection title={m.nav_delivery()}>
      <div className="mb-3 flex flex-col gap-3 empty:hidden" aria-live="polite">
        {said && <Note>{said}</Note>}
        <ErrorNote>{error}</ErrorNote>
      </div>
      {view.trips.length > 0 && (
        <ul className="flex flex-col gap-2">
          {view.trips.map((trip) => (
            <li key={trip.deliveryId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className="min-w-0">
                <a className="font-semibold text-fg-link underline" href={`/livraisons/${trip.deliveryId}`}>
                  {m.trip_slip_of({ day: formatDay(trip.plannedOn) })}
                </a>
                <span className="block text-body-sm text-fg-muted">
                  {trip.zoneName} · {trip.address}
                  {trip.recipient && ` · ${m.trip_received_by({ name: trip.recipient })}`}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <Tag tone={deliveryStatusTones[trip.status]}>{deliveryStatusWords[trip.status]()}</Tag>
                {mayPlan && trip.status === 'planned' && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void run(() => cancelTrip({ data: { deliveryId: trip.deliveryId } }), m.trip_cancelled_said())}
                  >
                    {m.trip_cancel()}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {mayPlan && open && !under && !planning && (
        <div className="mt-3">
          {view.zones.length === 0 ? (
            <p className="text-fg-muted">
              {m.trip_no_zone()}{' '}
              <a className="font-semibold text-fg-link underline" href="/livraisons">
                {m.nav_delivery()}
              </a>
            </p>
          ) : (
            <Button variant="secondary" onClick={() => setPlanning(true)}>
              {m.trip_plan_for_order()}
            </Button>
          )}
        </div>
      )}
      {planning && (
        <div className="mt-3 flex max-w-xl flex-col gap-4">
          <SelectField
            label={m.trip_zone()}
            value={zoneId}
            onChange={(event) => setZoneId(event.target.value)}
            options={view.zones.map((each) => ({
              value: each.zoneId,
              label: each.fee > 0 ? `${each.name} — ${formatMoney(each.fee)}` : `${each.name} — ${m.trip_free()}`,
            }))}
          />
          <TextField label={m.trip_address()} value={address} maxLength={300} onChange={(event) => setAddress(event.target.value)} />
          <TextField label={m.trip_day()} type="date" value={day} onChange={(event) => setDay(event.target.value)} />
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy || !zoneId || address.trim() === '' || !/^\d{4}-\d{2}-\d{2}$/.test(day)}
              onClick={() =>
                void run(
                  () => planTrip({ data: { kind: 'deliver', orderId, zoneId, address, plannedOn: day } }),
                  zone && zone.fee > 0
                    ? m.trip_planned_fee({ fee: formatMoney(zone.fee) })
                    : m.trip_planned(),
                )
              }
            >
              {m.trip_plan_confirm()}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setPlanning(false)}>
              {m.action_cancel()}
            </Button>
          </div>
        </div>
      )}
    </PageSection>
  );
}
