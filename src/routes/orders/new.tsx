import {
  Button,
  Chip,
  EmptyState,
  Icon,
  PageHeader,
  PageSection,
  TextField,
} from '@kete/design';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { withCustomerPrices, type PriceLine } from '@/features/accounts/domain/accounts';
import { fetchCounterAccount } from '@/features/accounts/functions';
import { packAdmits, priceOf } from '@/features/catalog/domain/catalog';
import type { Customer } from '@/features/customers';
import { lookupCustomer } from '@/features/customers/functions';
import { isNetworkFailure, withPending } from '@/features/device/domain/pending';
import { readDevice, readPending, readScale, savePending, scaleIsSupported } from '@/features/device/ui/device';
import type { PaymentMethod } from '@/features/orders';
import { moneyMethods } from '@/features/orders/domain/order';
import { priceOrder, type PricedLine } from '@/features/orders/domain/pricing';
import { checkCost, fetchCounter, receiveOrder, understand } from '@/features/orders/functions';
import { gestureKey, MoneyFields, wholeAmount } from '@/features/orders/ui/MoneyFields';
import { errorSentence } from '@/lib/errors';
import { CheckField, cx, ErrorNote, Note, SelectField, TextAreaField } from '@/lib/fields';
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
  /** The phone could not be looked up — no network: the name is typed, Nettio matches it later. */
  const [lookupFailed, setLookupFailed] = useState(false);
  const [kept, setKept] = useState<string | null>(null);
  const [weighing, setWeighing] = useState(false);
  const [canWeigh, setCanWeigh] = useState(false);
  /** Her own prices and her prepaid credit (specs/026-accounts). */
  const [account, setAccount] = useState<{ prices: PriceLine[]; credit: number } | null>(null);
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
  // A deposit said in a sentence, or dictated (specs/011-dictate): it fills this form, no more.
  const [sentence, setSentence] = useState('');
  const [writing, setWriting] = useState(false);
  const [listening, setListening] = useState<'idle' | 'recording' | 'thinking'>('idle');
  const [heard, setHeard] = useState<{ said: string; photo: boolean; notFound: string[] } | null>(null);
  const picture = useRef<HTMLInputElement | null>(null);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  /** The guard-rail: the total falls under the variable cost of the content (specs/004-earn). */
  const [guard, setGuard] = useState<{ below: boolean; variableCost: number | null } | null>(null);

  // The site the person last worked at, on this device.
  useEffect(() => {
    const remembered = window.localStorage.getItem(SITE_MEMORY);
    if (remembered && counter?.sites.some((site) => site.siteId === remembered)) {
      setSiteId(remembered);
    }
  }, [counter]);

  // A scale on a serial port is this device's own: asked of the browser once it is there.
  useEffect(() => setCanWeigh(scaleIsSupported()), []);

  // The customer behind the phone, once enough digits are typed.
  useEffect(() => {
    setFound(null);
    setPhoneError(null);
    setLookupFailed(false);
    if (phone.replace(/\D/g, '').length < 8) return;
    let stale = false;
    const timer = setTimeout(() => {
      lookupCustomer({ data: { phone } })
        .then((outcome) => {
          if (stale) return;
          if (outcome.ok) setFound(outcome.output);
          else setPhoneError(errorSentence(outcome.code));
        })
        .catch((failure: unknown) => {
          if (stale || !isNetworkFailure(failure, navigator.onLine)) return;
          // No network: the deposit can still be taken, with the name typed.
          setFound({ phone, customer: null });
          setLookupFailed(true);
        });
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [phone]);

  const knownId = found?.customer?.customerId;
  useEffect(() => {
    setAccount(null);
    if (!knownId) return;
    let stale = false;
    fetchCounterAccount({ data: { customerId: knownId } })
      .then((read) => {
        if (!stale) setAccount(read);
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, [knownId]);

  if (!counter) return <EmptyState title={m.error_not_allowed()} />;
  if (counter.sites.length === 0) return <EmptyState title={m.counter_no_site()} />;
  if (sold.length === 0) {
    return <EmptyState title={m.counter_no_price_title()}>{m.counter_no_price_body()}</EmptyState>;
  }

  const { catalog, settings } = counter;
  // What this customer pays: her own prices where the laundry agreed some.
  const prices = withCustomerPrices(catalog.prices, account?.prices ?? []);
  const service = sold.find((s) => s.serviceId === serviceId) ?? sold[0];
  const entries = Object.entries(quantities).filter(([, quantity]) => quantity > 0);
  const lines = entries.flatMap(([id, quantity]) => {
    const [lineService = '', lineArticle = ''] = id.split('|');
    const of = catalog.services.find((s) => s.serviceId === lineService);
    const unitPrice = priceOf(prices, lineService, lineArticle || null);
    if (!of || unitPrice === undefined) return [];
    const article = catalog.articles.find((a) => a.articleId === lineArticle);
    return [
      {
        id,
        label: article ? `${article.name} · ${of.name}` : of.name,
        piece: article ? article.name : null,
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

  /** Fills the form with what Nettio understood; the person checks, corrects and saves. */
  async function grasp(
    said: { text: string } | { audio: string } | { image: string; mediaType: 'image/jpeg' },
  ) {
    setListening('thinking');
    setDictationError(null);
    try {
      const outcome = await understand({ data: said });
      if (!outcome.available) {
        const reasons: Record<string, () => string> = {
          not_connected: m.dictate_not_connected,
          no_voice: m.dictate_no_voice,
          budget_spent: m.ask_budget_spent,
          nothing_heard: m.dictate_nothing_heard,
          nothing_seen: m.dictate_nothing_seen,
          not_allowed: m.error_not_allowed,
        };
        setDictationError((reasons[outcome.reason] ?? m.error_generic)());
        return;
      }
      const { understood } = outcome;
      setQuantities((current) => ({
        ...current,
        ...Object.fromEntries(
          understood.lines.map((line) => [`${line.serviceId}|${line.articleId ?? ''}`, line.quantity]),
        ),
      }));
      setDefects((current) => ({
        ...current,
        ...Object.fromEntries(
          understood.lines
            .filter((line) => line.defects)
            .map((line) => [`${line.serviceId}|${line.articleId ?? ''}`, line.defects]),
        ),
      }));
      if (understood.lines[0]) setServiceId(understood.lines[0].serviceId);
      if (understood.phone) setPhone(understood.phone);
      if (understood.customerName) setName(understood.customerName);
      if (understood.packId) setPackId(understood.packId);
      if (understood.express) setExpress(true);
      setHeard({
        said: outcome.heard,
        photo: outcome.source === 'photo',
        notFound: understood.notFound,
      });
      setSentence('');
    } catch {
      setDictationError(m.error_generic());
    } finally {
      setListening('idle');
    }
  }

  /**
   * A picture of a list or of the laundry laid out: made smaller on the phone first (a counter's
   * connection is slow), read once, never kept.
   */
  async function look(file: File | undefined) {
    if (!file) return;
    setDictationError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1] ?? '';
      if (image.length < 100) throw new Error('empty');
      await grasp({ image, mediaType: 'image/jpeg' });
    } catch {
      setDictationError(m.dictate_photo_unreadable());
    }
  }

  async function record() {
    if (listening === 'recording') {
      recorder.current?.stop();
      return;
    }
    setDictationError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      next.ondataavailable = (event) => chunks.push(event.data);
      next.onstop = () => {
        for (const track of stream.getTracks()) track.stop();
        const reader = new FileReader();
        // The recording is read once, sent, and never kept.
        reader.onloadend = () => void grasp({ audio: String(reader.result).split(',')[1] ?? '' });
        reader.readAsDataURL(new Blob(chunks, { type: next.mimeType }));
      };
      recorder.current = next;
      next.start();
      setListening('recording');
    } catch {
      setDictationError(m.dictate_mic_refused());
    }
  }

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
    setKept(null);
    const order = {
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
    };
    try {
      const outcome = await receiveOrder({ data: { key, order } });
      if (outcome.ok) {
        window.localStorage.setItem(SITE_MEMORY, siteId);
        setKey(gestureKey('dep'));
        await navigate({ to: '/depots/$orderId', params: { orderId: outcome.output.orderId } });
      } else {
        setError(errorSentence(outcome.code));
      }
    } catch (failure) {
      if (isNetworkFailure(failure, navigator.onLine)) {
        // Kept on this device with its key: it is sent once the network returns, and only once.
        savePending(
          withPending(readPending(), {
            key,
            order,
            customer: found.customer?.name ?? (name || found.phone),
            total: price.total,
            savedAt: new Date().toISOString(),
          }),
        );
        setKey(gestureKey('dep'));
        setQuantities({});
        setDefects({});
        setPhone('');
        setName('');
        setNote('');
        setDiscount('');
        setPaying(false);
        setAmount('');
        setKept(m.pending_kept());
      } else {
        setError(m.error_generic());
      }
    } finally {
      setBusy(false);
    }
  }

  async function weigh(lineId: string) {
    setWeighing(true);
    setError(null);
    try {
      const kilos = await readScale(readDevice().baud);
      if (kilos === null) setError(m.scale_nothing());
      else setQuantities((current) => ({ ...current, [lineId]: kilos }));
    } catch {
      setError(m.scale_failed());
    } finally {
      setWeighing(false);
    }
  }

  const packs = catalog.packs.filter((p) =>
    catalog.services.some((s) => packAdmits(p, s)),
  );
  // The basket, service by service: one deposit holds several services at once.
  const groups = sold
    .map((entry) => ({
      service: entry,
      lines: lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.priced.serviceId === entry.serviceId),
    }))
    .filter((group) => group.lines.length > 0);
  /** What a service already holds in this deposit, said on its chip: pieces, or kilos. */
  const held = (entry: (typeof sold)[number]): string | null => {
    const own = lines.filter((line) => line.priced.serviceId === entry.serviceId);
    if (own.length === 0) return null;
    const sum = own.reduce((total, line) => total + line.priced.quantity, 0);
    return entry.pricing === 'per_kg' ? `${formatNumber(sum, 3)} kg` : formatNumber(sum);
  };
  return (
    <div className="flex flex-col max-[760px]:pb-24">
      <PageHeader title={m.counter_title()} />
      <div className="grid gap-x-10 min-[1000px]:grid-cols-[minmax(0,1fr)_380px] min-[1000px]:items-start">
        <div className="min-w-0">
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
              {kept && <Note>{kept}</Note>}
              <TextField
                label={m.customer_phone()}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={phone}
                {...(phoneError ? { error: phoneError } : {})}
                onChange={(event) => setPhone(event.target.value)}
              />
              {account && (account.prices.length > 0 || account.credit > 0) && (
                <Note>
                  {[
                    account.prices.length > 0 ? m.counter_own_prices({ count: account.prices.length }) : '',
                    account.credit > 0 ? m.counter_credit({ amount: formatMoney(account.credit) }) : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                </Note>
              )}
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
                  hint={lookupFailed ? m.pending_customer_hint() : m.counter_new_customer()}
                  value={name}
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </div>
          </PageSection>

          <PageSection title={m.counter_content()}>
            {counter.dictation.text && (
              <div className="mb-5">
                <div className="flex flex-wrap gap-2">
                  {counter.dictation.voice && (
                    <Button
                      variant="secondary"
                      disabled={listening === 'thinking'}
                      onClick={() => void record()}
                    >
                      <Icon name={listening === 'recording' ? 'stop' : 'mic'} />
                      {listening === 'recording' ? m.dictate_stop() : m.dictate_record()}
                    </Button>
                  )}
                  {counter.dictation.photo && (
                    <>
                      <input
                        ref={picture}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        aria-label={m.dictate_photo()}
                        tabIndex={-1}
                        onChange={(event) => {
                          void look(event.target.files?.[0]);
                          event.target.value = '';
                        }}
                      />
                      <Button
                        variant="secondary"
                        disabled={listening !== 'idle'}
                        onClick={() => picture.current?.click()}
                      >
                        <Icon name="file" />
                        {m.dictate_photo()}
                      </Button>
                    </>
                  )}
                  <Button
                    variant="secondary"
                    aria-expanded={writing}
                    disabled={listening !== 'idle'}
                    onClick={() => setWriting((open) => !open)}
                  >
                    {m.dictate_write()}
                  </Button>
                </div>
                {writing && (
                  <div className="mt-3 flex flex-col gap-3">
                    <TextAreaField
                      label={m.dictate_sentence()}
                      hint={m.dictate_example()}
                      value={sentence}
                      rows={2}
                      maxLength={1500}
                      disabled={listening !== 'idle'}
                      onChange={setSentence}
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        disabled={listening !== 'idle' || sentence.trim().length < 2}
                        onClick={() => void grasp({ text: sentence })}
                      >
                        {m.dictate_understand()}
                      </Button>
                    </div>
                  </div>
                )}
                <div className="mt-3 flex flex-col gap-2" aria-live="polite">
                  {listening === 'thinking' && <Note>{m.dictate_thinking()}</Note>}
                  {heard && (
                    <Note>
                      {heard.photo
                        ? m.dictate_seen({ seen: heard.said })
                        : m.dictate_understood({ said: heard.said })}
                    </Note>
                  )}
                  {heard && heard.notFound.length > 0 && (
                    <ErrorNote>{m.dictate_not_found({ items: heard.notFound.join(' · ') })}</ErrorNote>
                  )}
                  <ErrorNote>{dictationError}</ErrorNote>
                </div>
              </div>
            )}

            {/*
              One row that scrolls sideways, never wraps: a chip that grew with its count would push
              the articles down, under the finger that is adding pieces.
            */}
            <div
              role="group"
              aria-label={m.field_service()}
              className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
            >
              {sold.map((entry) => {
                const inside = held(entry);
                return (
                  <Chip
                    key={entry.serviceId}
                    className="shrink-0 whitespace-nowrap"
                    pressed={entry.serviceId === service?.serviceId}
                    onClick={() => setServiceId(entry.serviceId)}
                  >
                    {entry.name}{' '}
                    {inside && (
                      <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-fg px-1.5 font-number text-[11px] font-semibold text-canvas tabular-nums">
                        {inside}
                      </span>
                    )}
                  </Chip>
                );
              })}
            </div>
            {service?.pricing === 'per_kg' ? (
              <div className="mt-4 flex flex-wrap items-end gap-3">
              <TextField
                className="max-w-60"
                label={m.counter_kilos()}
                hint={m.counter_kilo_price({
                  price: formatMoney(priceOf(prices, service.serviceId, null) ?? 0),
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
              {canWeigh && (
                <Button variant="secondary" disabled={weighing} onClick={() => void weigh(`${service.serviceId}|`)}>
                  {m.scale_read_button()}
                </Button>
              )}
              </div>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-3 min-[761px]:grid-cols-3 min-[1300px]:grid-cols-4">
                {catalog.articles
                  .filter((article) =>
                    service ? priceOf(prices, service.serviceId, article.articleId) !== undefined : false,
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
                          {formatMoney(priceOf(prices, service?.serviceId ?? '', article.articleId) ?? 0)}
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
        </div>

        {/* The basket: always in sight on a wide screen, one touch away on a phone. */}
        <section
          id="panier"
          aria-labelledby="panier-title"
          className="mt-10 scroll-mt-4 rounded-box border border-line-strong bg-surface p-4 min-[1000px]:sticky min-[1000px]:top-6 min-[1000px]:mt-0"
        >
          <h2 id="panier-title" className="font-heading text-title font-semibold">
            {groups.length > 0 ? m.basket_title_count({ services: groups.length }) : m.basket_title()}
          </h2>
          {lines.length === 0 || !price ? (
            <p className="mt-2 text-fg-muted">{m.basket_empty()}</p>
          ) : (
            <>
              <div className="mt-3 flex flex-col gap-4">
                {groups.map((group) => (
                  <div key={group.service.serviceId}>
                    <h3 className="text-body-sm font-semibold text-fg-muted">{group.service.name}</h3>
                    <ul className="mt-1 divide-y divide-line">
                      {group.lines.map(({ line, index }) => (
                        <li key={line.id} className="flex flex-col gap-2 py-2.5">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0">
                              <span className="font-number font-semibold">
                                {formatNumber(line.priced.quantity, 3)}
                                {line.priced.pricing === 'per_kg' ? ' kg' : ' ×'}
                              </span>{' '}
                              {line.piece ?? m.basket_by_weight()}
                            </span>
                            <span className="flex items-baseline gap-3">
                              <span className="font-number whitespace-nowrap">
                                {formatMoney(price.lines[index]?.amount ?? 0)}
                              </span>
                              <button
                                type="button"
                                aria-label={m.basket_remove({ name: line.label })}
                                onClick={() =>
                                  setQuantities((current) => ({ ...current, [line.id]: 0 }))
                                }
                                className="-m-2 p-2 text-fg-muted hover:text-fg"
                              >
                                <Icon name="close" size={16} />
                              </button>
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
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
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

              <dl className="mt-5 flex flex-col gap-1.5 border-t border-line pt-4">
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
                <div className="flex items-baseline justify-between gap-3 font-semibold">
                  <dt className="text-title">{m.order_total()}</dt>
                  <dd className="font-number text-[28px] leading-tight">{formatMoney(price.total)}</dd>
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
              {!found && phone.trim() === '' && (
                <p className="mt-4 text-body-sm text-fg-muted">{m.basket_needs_customer()}</p>
              )}
              {found && !found.customer && name.trim() === '' && (
                <p className="mt-4 text-body-sm text-fg-muted">{m.basket_needs_name()}</p>
              )}
              {paying && (
                <div className="mt-5">
                  <MoneyFields
                    amount={amount}
                    method={method}
                    hint={m.counter_pay_hint({ total: formatMoney(price.total) })}
                    methods={account && account.credit > 0 ? [...moneyMethods, 'credit'] : moneyMethods}
                    onAmount={setAmount}
                    onMethod={setMethod}
                  />
                </div>
              )}
              <div className="mt-4">
                <ErrorNote>{error}</ErrorNote>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                {paying ? (
                  <>
                    <Button disabled={busy || !ready} onClick={() => void submit(true)}>
                      {m.counter_save_and_cash()}
                    </Button>
                    <Button variant="secondary" disabled={busy} onClick={() => setPaying(false)}>
                      {m.action_cancel()}
                    </Button>
                  </>
                ) : (
                  <>
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
                    <Button variant="secondary" disabled={busy || !ready} onClick={() => void submit(false)}>
                      {m.action_save()}
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/*
        On a phone the basket follows the thumb: what it holds and its total, one touch from it.
        It is there from the start, empty: a bar that appeared under a finger adding pieces would
        take the next touch.
      */}
      <a
        href="#panier"
        className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] z-10 hidden items-center justify-between gap-3 rounded-box bg-fg px-4 py-3 text-canvas shadow-[0_6px_20px_#0004] max-[760px]:flex"
      >
        <span className="font-semibold">
          {groups.length > 0 ? m.basket_bar({ services: groups.length }) : m.basket_bar_empty()}
        </span>
        {lines.length > 0 && price && (
          <span className="font-number text-title font-semibold">{formatMoney(price.total)}</span>
        )}
      </a>
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
