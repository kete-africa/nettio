import { Button, Chip, ChipGroup, EmptyState, PageHeader, PageSection, TextField } from '@kete/design';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { packAdmits, priceOf } from '@/features/catalog/domain/catalog';
import type { Customer } from '@/features/customers';
import { lookupCustomer } from '@/features/customers/functions';
import type { PaymentMethod } from '@/features/orders';
import { priceOrder, type PricedLine } from '@/features/orders/domain/pricing';
import { checkCost, fetchCounter, receiveOrder } from '@/features/orders/functions';
import { gestureKey, MoneyFields, wholeAmount } from '@/features/orders/ui/MoneyFields';
import { errorSentence } from '@/lib/errors';
import { CheckField, cx, ErrorNote, Note, SelectField } from '@/lib/fields';
import { formatDayTime, formatMoney, formatNumber } from '@/lib/format';
import * as m from '@/paraglide/messages.js';

// The counter's screen (specs/002-counter): the customer by her phone, the real content piece by
// piece, the pack if any — and the price, computed as it is typed by the same function the server
// uses.
export const Route = createFileRoute('/_app/depots/nouveau')({
  loader: () => fetchCounter(),
  component: NewOrderPage,
});

const SITE_MEMORY = 'nettio.site';

function NewOrderPage() {
  const counter = Route.useLoaderData();
  const navigate = useNavigate();
  const [siteId, setSiteId] = useState(counter?.sites[0]?.siteId ?? '');
  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<{ phone: string; customer: Customer | null } | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const sold = useMemo(
    () =>
      (counter?.catalog.services ?? []).filter((service) =>
        counter?.catalog.prices.some((price) => price.serviceId === service.serviceId),
      ),
    [counter],
  );
  const [serviceId, setServiceId] = useState(sold[0]?.serviceId ?? '');
  /** Pieces by « service|article », kilos by « service| ». */
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [defects, setDefects] = useState<Record<string, string>>({});
  const [packId, setPackId] = useState('');
  const [express, setExpress] = useState(false);
  const [discount, setDiscount] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [key, setKey] = useState(() => gestureKey('dep'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The guard-rail: the total falls under the variable cost of the content (specs/004-earn). */
  const [guard, setGuard] = useState<{ below: boolean; variableCost: number | null } | null>(null);

  // The site the person last worked at, on this device.
  useEffect(() => {
    const remembered = window.localStorage.getItem(SITE_MEMORY);
    if (remembered && counter?.sites.some((site) => site.siteId === remembered)) {
      setSiteId(remembered);
    }
  }, [counter]);

  // The customer behind the phone, once enough digits are typed.
  useEffect(() => {
    setFound(null);
    setPhoneError(null);
    if (phone.replace(/\D/g, '').length < 8) return;
    let stale = false;
    const timer = setTimeout(() => {
      lookupCustomer({ data: { phone } })
        .then((outcome) => {
          if (stale) return;
          if (outcome.ok) setFound(outcome.output);
          else setPhoneError(errorSentence(outcome.code));
        })
        .catch(() => undefined);
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [phone]);

  if (!counter) return <EmptyState title={m.error_not_allowed()} />;
  if (counter.sites.length === 0) return <EmptyState title={m.counter_no_site()} />;
  if (sold.length === 0) {
    return <EmptyState title={m.counter_no_price_title()}>{m.counter_no_price_body()}</EmptyState>;
  }

  const { catalog, settings } = counter;
  const service = sold.find((s) => s.serviceId === serviceId) ?? sold[0];
  const entries = Object.entries(quantities).filter(([, quantity]) => quantity > 0);
  const lines = entries.flatMap(([id, quantity]) => {
    const [lineService = '', lineArticle = ''] = id.split('|');
    const of = catalog.services.find((s) => s.serviceId === lineService);
    const unitPrice = priceOf(catalog.prices, lineService, lineArticle || null);
    if (!of || unitPrice === undefined) return [];
    const article = catalog.articles.find((a) => a.articleId === lineArticle);
    return [
      {
        id,
        label: article ? `${article.name} · ${of.name}` : of.name,
        priced: {
          serviceId: lineService,
          articleId: lineArticle || null,
          pricing: of.pricing,
          quantity,
          unitPrice,
        } satisfies PricedLine,
      },
    ];
  });
  const pack = catalog.packs.find((p) => p.packId === packId) ?? null;
  const discountValue = wholeAmount(discount) ?? 0;
  let price: ReturnType<typeof priceOrder> | null = null;
  try {
    price = priceOrder({
      lines: lines.map((line) => line.priced),
      pack,
      expressPercent: express ? settings.expressPercent : 0,
      discount: discountValue,
    });
  } catch {
    price = null;
  }
  const overCeiling =
    price !== null &&
    price.discount > 0 &&
    (price.discount * 100) / (price.total + price.discount) > settings.discountCeilingPercent;
  const promised = new Date(
    Date.now() + (express ? settings.expressHours : settings.promisedHours) * 3_600_000,
  );
  // The guard-rail follows what is typed; it says, it never blocks.
  const guardKey = price
    ? `${price.total}|${lines.map((l) => `${l.id}:${l.priced.quantity}`).join(',')}`
    : '';
  useEffect(() => {
    setGuard(null);
    if (!guardKey) return;
    const [total = '0', content = ''] = guardKey.split('|');
    if (!content) return;
    let stale = false;
    const timer = setTimeout(() => {
      checkCost({
        data: {
          total: Number(total),
          lines: content.split(',').map((entry) => {
            const [id = '', quantity = '0'] = entry.split(':');
            const [lineService = '', lineArticle = ''] = id.split('|');
            return { serviceId: lineService, articleId: lineArticle || null, quantity: Number(quantity) };
          }),
        },
      })
        .then((outcome) => {
          if (!stale && outcome.ok) setGuard(outcome.output);
        })
        .catch(() => undefined);
    }, 500);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [guardKey]);
  const customerKnown = Boolean(found?.customer);
  const ready =
    lines.length > 0 &&
    price !== null &&
    found !== null &&
    (customerKnown || name.trim() !== '') &&
    (price.discount === 0 || reason.trim() !== '');

  const step = (id: string, by: number) =>
    setQuantities((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + by) }));

  async function submit(withPayment: boolean) {
    if (!price || !found) return;
    const paid = withPayment ? wholeAmount(amount) : null;
    if (withPayment && paid === null) {
      setError(m.error_amount());
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const outcome = await receiveOrder({
        data: {
          key,
          order: {
            siteId,
            ...(found.customer
              ? { customerId: found.customer.customerId }
              : { phone: found.phone, customerName: name }),
            lines: lines.map((line) => ({
              serviceId: line.priced.serviceId,
              articleId: line.priced.articleId,
              quantity: line.priced.quantity,
              defects: defects[line.id] ?? '',
            })),
            packId: pack?.packId ?? null,
            express,
            discount: price.discount,
            ...(price.discount > 0 ? { discountReason: reason } : {}),
            note,
            ...(paid !== null ? { payment: { amount: paid, method } } : {}),
          },
        },
      });
      if (outcome.ok) {
        window.localStorage.setItem(SITE_MEMORY, siteId);
        setKey(gestureKey('dep'));
        await navigate({ to: '/depots/$orderId', params: { orderId: outcome.output.orderId } });
      } else {
        setError(errorSentence(outcome.code));
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  const packs = catalog.packs.filter((p) =>
    catalog.services.some((s) => packAdmits(p, s)),
  );
  return (
    <div className="flex flex-col">
      <PageHeader title={m.counter_title()} />
      {counter.sites.length > 1 && (
        <SelectField
          className="mb-6"
          label={m.counter_site()}
          value={siteId}
          onChange={(event) => setSiteId(event.target.value)}
          options={counter.sites.map((site) => ({
            value: site.siteId,
            label: `${site.name} (${site.code})`,
          }))}
        />
      )}

      <PageSection first title={m.counter_customer()}>
        <div className="flex flex-col gap-3">
          <TextField
            label={m.customer_phone()}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={phone}
            {...(phoneError ? { error: phoneError } : {})}
            onChange={(event) => setPhone(event.target.value)}
          />
          {found?.customer && (
            <p className="rounded-control bg-surface-selected px-3 py-2">
              <span className="font-semibold">{found.customer.name}</span>
              {found.customer.preferences && (
                <span className="block text-body-sm text-fg-muted">
                  {found.customer.preferences}
                </span>
              )}
            </p>
          )}
          {found && !found.customer && (
            <TextField
              label={m.customer_name()}
              hint={m.counter_new_customer()}
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </div>
      </PageSection>

      <PageSection title={m.counter_content()}>
        <ChipGroup label={m.field_service()}>
          {sold.map((entry) => (
            <Chip
              key={entry.serviceId}
              pressed={entry.serviceId === service?.serviceId}
              onClick={() => setServiceId(entry.serviceId)}
            >
              {entry.name}
            </Chip>
          ))}
        </ChipGroup>
        {service?.pricing === 'per_kg' ? (
          <TextField
            className="mt-4 max-w-60"
            label={m.counter_kilos()}
            hint={m.counter_kilo_price({
              price: formatMoney(priceOf(catalog.prices, service.serviceId, null) ?? 0),
            })}
            type="number"
            inputMode="decimal"
            min={0}
            step={0.1}
            value={quantities[`${service.serviceId}|`] ? String(quantities[`${service.serviceId}|`]) : ''}
            onChange={(event) =>
              setQuantities((current) => ({
                ...current,
                [`${service.serviceId}|`]: Math.max(0, Number(event.target.value) || 0),
              }))
            }
          />
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 min-[761px]:grid-cols-4">
            {catalog.articles
              .filter((article) =>
                service ? priceOf(catalog.prices, service.serviceId, article.articleId) !== undefined : false,
              )
              .map((article) => {
                const id = `${service?.serviceId}|${article.articleId}`;
                const quantity = quantities[id] ?? 0;
                return (
                  <li
                    key={id}
                    className={cx(
                      'flex flex-col gap-2 rounded-box border p-3',
                      quantity > 0 ? 'border-line-selected bg-surface-selected' : 'border-line bg-surface',
                    )}
                  >
                    <span className="truncate font-semibold">{article.name}</span>
                    <span className="font-number text-body-sm text-fg-muted">
                      {formatMoney(priceOf(catalog.prices, service?.serviceId ?? '', article.articleId) ?? 0)}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-label={m.counter_less({ name: article.name })}
                        disabled={quantity === 0}
                        onClick={() => step(id, -1)}
                        className="size-11 rounded-control border border-line-control bg-surface-control text-title disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="font-number text-title" aria-live="polite">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={m.counter_more({ name: article.name })}
                        onClick={() => step(id, 1)}
                        className="size-11 rounded-control bg-action text-title text-on-action"
                      >
                        +
                      </button>
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </PageSection>

      {lines.length > 0 && price && (
        <PageSection title={m.counter_summary()}>
          <ul className="divide-y divide-line rounded-box border border-line bg-surface">
            {lines.map((line, index) => (
              <li key={line.id} className="flex flex-col gap-2 px-4 py-3">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-number font-semibold">
                      {formatNumber(line.priced.quantity, 3)}
                      {line.priced.pricing === 'per_kg' ? ' kg' : ' ×'}
                    </span>{' '}
                    {line.label}
                  </span>
                  <span className="font-number whitespace-nowrap">
                    {formatMoney(price.lines[index]?.amount ?? 0)}
                  </span>
                </span>
                {pack && (price.lines[index]?.covered ?? 0) > 0 && (
                  <span className="text-body-sm text-fg-muted">
                    {m.counter_line_covered({
                      covered: formatNumber(price.lines[index]?.covered ?? 0, 3),
                      due: formatMoney(price.lines[index]?.due ?? 0),
                    })}
                  </span>
                )}
                <input
                  aria-label={m.counter_defects_for({ name: line.label })}
                  placeholder={m.counter_defects()}
                  maxLength={300}
                  value={defects[line.id] ?? ''}
                  onChange={(event) =>
                    setDefects((current) => ({ ...current, [line.id]: event.target.value }))
                  }
                  className="h-9 rounded-control border border-line bg-surface-control px-3 text-body-sm text-fg"
                />
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-col gap-4">
            {packs.length > 0 && (
              <SelectField
                label={m.counter_pack()}
                value={packId}
                onChange={(event) => setPackId(event.target.value)}
                options={[
                  { value: '', label: m.counter_no_pack() },
                  ...packs.map((p) => ({
                    value: p.packId,
                    label: `${p.name} — ${formatMoney(p.price)}`,
                  })),
                ]}
                {...(pack
                  ? {
                      hint:
                        pack.mode === 'pieces'
                          ? m.counter_pack_used_pieces({
                              used: formatNumber(price.packUsed),
                              quota: formatNumber(pack.quota),
                            })
                          : m.counter_pack_used_kilos({
                              used: formatNumber(price.packUsed, 3),
                              quota: formatNumber(pack.quota, 3),
                            }),
                    }
                  : {})}
              />
            )}
            <CheckField
              label={m.counter_express()}
              hint={
                settings.expressPercent > 0
                  ? m.counter_express_hint({ percent: settings.expressPercent })
                  : m.counter_express_free()
              }
              checked={express}
              onChange={setExpress}
            />
            <TextField
              label={m.counter_discount()}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
            {price.discount > 0 && (
              <TextField
                label={m.counter_discount_reason()}
                value={reason}
                maxLength={300}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
            {overCeiling && (
              <Note>
                {counter.mayExceedDiscount
                  ? m.counter_discount_above_yours({ ceiling: settings.discountCeilingPercent })
                  : m.counter_discount_above({ ceiling: settings.discountCeilingPercent })}
              </Note>
            )}
            <TextField
              label={m.counter_note()}
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <dl className="mt-6 flex flex-col gap-1.5 rounded-box border border-line-strong bg-surface p-4">
            {pack && (
              <>
                <Line label={pack.name} value={formatMoney(price.packPrice)} />
                {price.supplement > 0 && (
                  <Line label={m.counter_supplement()} value={formatMoney(price.supplement)} />
                )}
              </>
            )}
            {price.express > 0 && <Line label={m.counter_express()} value={formatMoney(price.express)} />}
            {price.discount > 0 && (
              <Line label={m.counter_discount()} value={`− ${formatMoney(price.discount)}`} />
            )}
            <div className="flex items-baseline justify-between gap-3 text-title font-semibold">
              <dt>{m.order_total()}</dt>
              <dd className="font-number">{formatMoney(price.total)}</dd>
            </div>
            <Line label={m.order_promised()} value={formatDayTime(promised)} />
          </dl>

          {guard?.below && (
            <div className="mt-4">
              <Note>
                {guard.variableCost === null
                  ? m.counter_below_cost()
                  : m.counter_below_cost_amount({ cost: formatMoney(guard.variableCost) })}
              </Note>
            </div>
          )}
          {paying && (
            <div className="mt-5">
              <MoneyFields
                amount={amount}
                method={method}
                hint={m.counter_pay_hint({ total: formatMoney(price.total) })}
                onAmount={setAmount}
                onMethod={setMethod}
              />
            </div>
          )}
          <div className="mt-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            {paying ? (
              <>
                <Button variant="secondary" disabled={busy} onClick={() => setPaying(false)}>
                  {m.action_cancel()}
                </Button>
                <Button disabled={busy || !ready} onClick={() => void submit(true)}>
                  {m.counter_save_and_cash()}
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" disabled={busy || !ready} onClick={() => void submit(false)}>
                  {m.action_save()}
                </Button>
                {counter.mayCollect && price.total > 0 && (
                  <Button
                    disabled={busy || !ready}
                    onClick={() => {
                      setAmount(String(price?.total ?? ''));
                      setPaying(true);
                    }}
                  >
                    {m.action_cash()}
                  </Button>
                )}
              </>
            )}
          </div>
        </PageSection>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-fg-muted">
      <dt>{label}</dt>
      <dd className="font-number whitespace-nowrap">{value}</dd>
    </div>
  );
}
