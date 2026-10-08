import { EmptyState, TextField } from '@kete/design';
import { useState } from 'react';
import { failure } from '@/lib/errors';
import { ErrorNote, Note, SelectField } from '@/lib/fields';
import { formatMoney } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import type { Catalog } from '../catalog.record';
import { priceOf } from '../domain/catalog';
import { setPrice } from '../functions';

/**
 * The prices, service by service: one per article, or one for a kilo. An empty field means the
 * couple is not sold. Nettio proposes none (constitution III).
 */
export function PricesTab({
  catalog,
  editable,
  onChanged,
}: {
  catalog: Catalog;
  editable: boolean;
  onChanged: () => Promise<void>;
}) {
  const services = catalog.services.filter((service) => service.active);
  const [serviceId, setServiceId] = useState(services[0]?.serviceId ?? '');
  const [error, setError] = useState<string | null>(null);
  const service = services.find((s) => s.serviceId === serviceId);
  if (!service) return <EmptyState title={m.catalog_no_service()} />;

  async function write(articleId: string | null, text: string) {
    const amount = text.trim() === '' ? null : Number(text);
    if (amount !== null && (!Number.isInteger(amount) || amount < 0)) {
      setError(m.error_amount());
      return;
    }
    if (amount === (priceOf(catalog.prices, serviceId, articleId) ?? null)) return;
    try {
      const outcome = await setPrice({ data: { serviceId, articleId, amount } });
      setError(failure(outcome));
      if (outcome.ok) await onChanged();
    } catch {
      setError(m.error_generic());
    }
  }

  const field = (key: string, label: string, articleId: string | null) => {
    const current = priceOf(catalog.prices, serviceId, articleId);
    return (
      <TextField
        key={`${serviceId}-${key}`}
        label={label}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        disabled={!editable}
        defaultValue={current ?? ''}
        hint={current === undefined ? m.price_not_sold() : formatMoney(current)}
        onBlur={(event) => void write(articleId, event.target.value)}
      />
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Note>{m.price_never_proposed()}</Note>
      <SelectField
        label={m.field_service()}
        value={serviceId}
        onChange={(event) => setServiceId(event.target.value)}
        options={services.map((s) => ({ value: s.serviceId, label: s.name }))}
      />
      <div className="grid grid-cols-2 gap-4 min-[761px]:grid-cols-3">
        {service.pricing === 'per_kg'
          ? field('kilo', m.price_per_kilo(), null)
          : catalog.articles
              .filter((article) => article.active)
              .map((article) => field(article.articleId, article.name, article.articleId))}
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
