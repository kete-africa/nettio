import { Button, DataTable, Drawer, EmptyState, Tag, TextField } from '@kete/design';
import { useState } from 'react';
import { failure } from '@/lib/errors';
import { CheckField, ErrorNote, SelectField } from '@/lib/fields';
import { formatMoney, formatNumber } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import type { Catalog, Pack, PackMode } from '../catalog.record';
import { savePack } from '../functions';

interface Draft {
  packId?: string;
  name: string;
  mode: PackMode;
  quota: string;
  price: string;
  serviceIds: string[];
  active: boolean;
}

const blank: Draft = { name: '', mode: 'pieces', quota: '', price: '', serviceIds: [], active: true };

/** The packs: a fixed price for a quota of pieces or kilos, on the services the laundry names. */
export function PacksTab({
  catalog,
  editable,
  onChanged,
}: {
  catalog: Catalog;
  editable: boolean;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quotaOf = (pack: Pick<Pack, 'mode' | 'quota'>) =>
    pack.mode === 'pieces'
      ? m.pack_quota_pieces({ count: formatNumber(pack.quota) })
      : m.pack_quota_kilos({ count: formatNumber(pack.quota, 1) });
  const eligible = (mode: PackMode) =>
    catalog.services.filter(
      (service) => service.active && service.pricing === (mode === 'pieces' ? 'per_piece' : 'per_kg'),
    );
  const open = (pack?: Pack) => {
    setError(null);
    setDraft(
      pack ? { ...pack, quota: String(pack.quota), price: String(pack.price) } : { ...blank },
    );
  };

  async function submit() {
    if (!draft) return;
    const quota = Number(draft.quota);
    const price = Number(draft.price);
    if (!(quota > 0) || !Number.isInteger(price) || price <= 0) {
      setError(m.error_amount());
      return;
    }
    setBusy(true);
    try {
      const outcome = await savePack({ data: { ...draft, quota, price } });
      setError(failure(outcome));
      if (outcome.ok) {
        setDraft(null);
        await onChanged();
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {editable && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => open()}>{m.catalog_add_pack()}</Button>
        </div>
      )}
      <DataTable
        caption={m.catalog_tab_packs()}
        rows={catalog.packs}
        rowKey={(pack) => pack.packId}
        {...(editable ? { onRowClick: (pack: Pack) => open(pack) } : {})}
        empty={<EmptyState title={m.catalog_no_pack()}>{m.catalog_no_pack_body()}</EmptyState>}
        columns={[
          { key: 'name', label: m.field_name(), render: (pack) => pack.name },
          { key: 'quota', label: m.pack_quota(), render: quotaOf },
          {
            key: 'price',
            label: m.field_price(),
            align: 'end',
            render: (pack) => formatMoney(pack.price),
          },
          {
            key: 'services',
            label: m.pack_services(),
            render: (pack) =>
              pack.serviceIds.length === 0
                ? m.pack_all_services()
                : catalog.services
                    .filter((service) => pack.serviceIds.includes(service.serviceId))
                    .map((service) => service.name)
                    .join(' · '),
          },
          {
            key: 'state',
            label: m.field_state(),
            render: (pack) =>
              pack.active ? <Tag tone="validated">{m.state_active()}</Tag> : <Tag>{m.state_retired()}</Tag>,
          },
        ]}
      />
      <Drawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.packId ? m.catalog_change_pack() : m.catalog_add_pack()}
        closeLabel={m.action_close()}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {m.action_cancel()}
            </Button>
            <Button disabled={busy || !draft?.name.trim()} onClick={() => void submit()}>
              {m.action_save()}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <TextField
              label={m.field_name()}
              value={draft.name}
              maxLength={80}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <SelectField
              label={m.pack_mode()}
              value={draft.mode}
              onChange={(event) =>
                setDraft({ ...draft, mode: event.target.value as PackMode, serviceIds: [] })
              }
              options={[
                { value: 'pieces', label: m.pack_mode_pieces() },
                { value: 'weight', label: m.pack_mode_weight() },
              ]}
            />
            <TextField
              label={draft.mode === 'pieces' ? m.pack_quota_label_pieces() : m.pack_quota_label_kilos()}
              type="number"
              inputMode="decimal"
              min={0}
              value={draft.quota}
              onChange={(event) => setDraft({ ...draft, quota: event.target.value })}
            />
            <TextField
              label={m.field_price()}
              hint={m.price_never_proposed()}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={draft.price}
              onChange={(event) => setDraft({ ...draft, price: event.target.value })}
            />
            <fieldset>
              <legend className="mb-1.5 text-body-sm font-semibold text-fg">
                {m.pack_services()}
              </legend>
              <p className="text-body-sm text-fg-muted">{m.pack_services_hint()}</p>
              {eligible(draft.mode).map((service) => (
                <CheckField
                  key={service.serviceId}
                  label={service.name}
                  checked={draft.serviceIds.includes(service.serviceId)}
                  onChange={(checked) =>
                    setDraft({
                      ...draft,
                      serviceIds: checked
                        ? [...draft.serviceIds, service.serviceId]
                        : draft.serviceIds.filter((id) => id !== service.serviceId),
                    })
                  }
                />
              ))}
            </fieldset>
            <CheckField
              label={m.state_active()}
              checked={draft.active}
              onChange={(active) => setDraft({ ...draft, active })}
            />
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </Drawer>
    </>
  );
}
