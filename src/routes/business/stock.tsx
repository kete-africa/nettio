import { Button, ConfirmDialog, EmptyState, PageHeader, PageSection, Tag, TextField, type TagTone } from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import type { StockState } from '@/features/stock/domain/stock';
import {
  cancelPurchase,
  countItems,
  fetchConsumption,
  fetchStock,
  orderPurchase,
  paySupplier,
  receivePurchase,
  saveItem,
  saveSupplier,
  useItem,
} from '@/features/stock/functions';
import { gestureKey } from '@/features/orders/ui/MoneyFields';
import { errorSentence } from '@/lib/errors';
import { CheckField, ErrorNote, Note, SelectField } from '@/lib/fields';
import { formatDay, formatMoney, formatMonth, formatNumber, formatSigned } from '@/lib/format';
import * as m from '@/paraglide/messages.js';

// Stock and purchasing (specs/029-stock): what is on the shelves, what to order, what was ordered
// and received, what is owed to suppliers — and what was used against what the sheets planned.
export const Route = createFileRoute('/_app/pressing/stock')({
  loader: async () => {
    const [board, consumption] = await Promise.all([fetchStock(), fetchConsumption({ data: {} })]);
    return { board, consumption };
  },
  component: StockPage,
});

const box = 'rounded-box border border-line bg-surface p-4';
const stateWords: Record<StockState, () => string> = { ok: m.stock_state_ok, low: m.stock_state_low, out: m.stock_state_out };
const stateTones: Record<StockState, TagTone> = { ok: 'validated', low: 'error', out: 'error' };
const paidFromWords = {
  mobile_money: m.method_mobile_money,
  bank: m.stock_paid_bank,
  other: m.stock_paid_other,
} as const;
type PaidFrom = keyof typeof paidFromWords;
type Form = 'item' | 'use' | 'count' | 'supplier' | 'order' | 'receive' | 'pay' | null;
const number = (text: string): number | null => (/^\d+([.,]\d+)?$/.test(text.trim()) ? Number(text.replace(',', '.')) : null);

function StockPage() {
  const { board, consumption } = Route.useLoaderData();
  const router = useRouter();
  const [form, setForm] = useState<Form>(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [threshold, setThreshold] = useState('');
  const [quantity, setQuantity] = useState('');
  const [loss, setLoss] = useState(false);
  const [note, setNote] = useState('');
  const [phone, setPhone] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<{ itemId: string; quantity: string; unitCost: string }[]>([]);
  const [itemId, setItemId] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [arrived, setArrived] = useState<Record<string, { quantity: string; unitCost: string }>>({});
  const [amount, setAmount] = useState('');
  const [paidFrom, setPaidFrom] = useState<PaidFrom>('mobile_money');
  const [confirming, setConfirming] = useState(false);
  const [key, setKey] = useState(() => gestureKey('stk'));
  if (!board) return <EmptyState title={m.error_not_allowed()} />;
  const items = board.items.filter((item) => item.active);
  const suppliers = board.suppliers.filter((supplier) => supplier.active);
  const open = board.purchases.filter((purchase) => purchase.status === 'ordered');
  const closed = board.purchases.filter((purchase) => purchase.status !== 'ordered').slice(0, 8);
  const item = board.items.find((each) => each.itemId === target);
  const supplier = board.suppliers.find((each) => each.supplierId === target);
  const purchase = board.purchases.find((each) => each.purchaseId === target);
  const itemName = (id: string) => board.items.find((each) => each.itemId === id);

  const show = (next: Form, id = '') => {
    setForm(next);
    setTarget(id);
    setError(null);
    setSaid(null);
    setQuantity('');
    setNote('');
    setLoss(false);
    setAmount('');
    setUnitCost('');
  };
  async function run(work: () => Promise<{ ok: boolean; code?: string }>, done: string) {
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      const outcome = await work();
      if (!outcome.ok) return setError(errorSentence(outcome.code ?? ''));
      await router.invalidate();
      setForm(null);
      setLines([]);
      setCounts({});
      setKey(gestureKey('stk'));
      setSaid(done);
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }
  const cancel = (
    <Button variant="secondary" disabled={busy} onClick={() => setForm(null)}>
      {m.action_cancel()}
    </Button>
  );
  const typedQuantity = number(quantity);
  const typedAmount = /^\d+$/.test(amount.trim()) ? Number(amount) : null;
  const typedCost = /^\d+$/.test(unitCost.trim()) ? Number(unitCost) : null;
  const orderTotal = lines.reduce((sum, line) => sum + Math.round((number(line.quantity) ?? 0) * Number(line.unitCost || 0)), 0);

  return (
    <>
      <PageHeader title={m.nav_stock()} description={m.stock_description()} />
      <div className="mb-4 flex flex-col gap-3 empty:hidden" aria-live="polite">
        {said && <Note>{said}</Note>}
        <ErrorNote>{error}</ErrorNote>
      </div>

      <PageSection first title={m.stock_shelves()}>
        {board.items.length === 0 ? (
          <p className="text-fg-muted">{m.stock_none()}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-box border border-line bg-surface">
            {board.items.map((each) => (
              <li key={each.itemId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="font-semibold">{each.name}</span>
                  {!each.active && <span className="ml-2 text-fg-muted">{m.stock_item_off()}</span>}
                  <span className="block text-body-sm text-fg-muted">
                    {each.threshold > 0 ? m.stock_threshold_at({ threshold: formatNumber(each.threshold, 3), unit: each.unit }) : m.stock_no_threshold()}
                    {each.value !== null && ` · ${m.stock_value({ amount: formatMoney(each.value) })}`}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  <span className="font-number font-semibold">
                    {formatNumber(each.level, 3)} {each.unit}
                  </span>
                  {each.active && <Tag tone={stateTones[each.state]}>{stateWords[each.state]()}</Tag>}
                  {board.may.move && each.active && (
                    <Button variant="secondary" disabled={busy} onClick={() => show('use', each.itemId)}>
                      {m.stock_use({ name: each.name })}
                    </Button>
                  )}
                  {board.may.manage && (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        show('item', each.itemId);
                        setName(each.name);
                        setUnit(each.unit);
                        setThreshold(String(each.threshold));
                      }}
                    >
                      {m.stock_edit({ name: each.name })}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {form === null && (
          <div className="mt-3 flex flex-wrap gap-3">
            {board.may.manage && (
              <Button
                variant="secondary"
                onClick={() => {
                  show('item');
                  setName('');
                  setUnit('');
                  setThreshold('');
                }}
              >
                {m.stock_add()}
              </Button>
            )}
            {board.may.manage && items.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  show('count');
                  setCounts(Object.fromEntries(items.map((each) => [each.itemId, String(each.level)])));
                }}
              >
                {m.stock_count()}
              </Button>
            )}
          </div>
        )}
        {form === 'item' && (
          <div className="mt-3 flex max-w-xl flex-col gap-4">
            <TextField label={m.stock_name()} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
            <TextField label={m.stock_unit()} hint={m.stock_unit_hint()} value={unit} maxLength={16} onChange={(event) => setUnit(event.target.value)} />
            <TextField
              label={m.stock_threshold()}
              hint={m.stock_threshold_hint()}
              inputMode="decimal"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy || name.trim() === '' || unit.trim() === '' || (threshold.trim() !== '' && number(threshold) === null)}
                onClick={() =>
                  void run(
                    () => saveItem({ data: { ...(target ? { itemId: target } : {}), name, unit, threshold: number(threshold) ?? 0, active: true } }),
                    m.stock_saved({ name }),
                  )
                }
              >
                {m.stock_save()}
              </Button>
              {target && item?.active && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => saveItem({ data: { itemId: target, name, unit, threshold: number(threshold) ?? 0, active: false } }),
                      m.stock_closed({ name }),
                    )
                  }
                >
                  {m.stock_close()}
                </Button>
              )}
              {cancel}
            </div>
          </div>
        )}
        {form === 'use' && item && (
          <div className="mt-3 flex max-w-xl flex-col gap-4">
            <TextField
              label={m.stock_use_quantity({ name: item.name, unit: item.unit })}
              hint={m.stock_on_shelf({ level: formatNumber(item.level, 3), unit: item.unit })}
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <CheckField label={m.stock_loss()} hint={m.stock_loss_hint()} checked={loss} onChange={setLoss} />
            <TextField label={m.counter_note()} value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy || typedQuantity === null || typedQuantity <= 0}
                onClick={() =>
                  void run(
                    () => useItem({ data: { key, use: { itemId: item.itemId, quantity: typedQuantity ?? 0, loss, note } } }),
                    m.stock_used({ quantity: formatNumber(typedQuantity ?? 0, 3), unit: item.unit, name: item.name }),
                  )
                }
              >
                {m.stock_use_confirm()}
              </Button>
              {cancel}
            </div>
          </div>
        )}
        {form === 'count' && (
          <div className="mt-3 flex max-w-xl flex-col gap-4">
            <p className="text-body-sm text-fg-muted">{m.stock_count_hint()}</p>
            {items.map((each) => (
              <TextField
                key={each.itemId}
                label={m.stock_counted({ name: each.name, unit: each.unit })}
                inputMode="decimal"
                value={counts[each.itemId] ?? ''}
                onChange={(event) => setCounts((current) => ({ ...current, [each.itemId]: event.target.value }))}
              />
            ))}
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy || items.some((each) => number(counts[each.itemId] ?? '') === null)}
                onClick={() =>
                  void run(
                    () =>
                      countItems({
                        data: { counts: items.map((each) => ({ itemId: each.itemId, counted: number(counts[each.itemId] ?? '') ?? 0 })) },
                      }),
                    m.stock_count_saved(),
                  )
                }
              >
                {m.stock_count_save()}
              </Button>
              {cancel}
            </div>
          </div>
        )}
      </PageSection>

      <PageSection title={m.purchases_title()}>
        {open.length === 0 ? (
          <p className="text-fg-muted">{m.purchases_none()}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((each) => (
              <li key={each.purchaseId} className={box}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-heading text-title font-semibold">
                    {each.number} · {each.supplierName}
                  </span>
                  <span className="text-body-sm text-fg-muted">{formatDay(each.orderedOn)}</span>
                </div>
                <ul className="mt-2 flex flex-col gap-1 text-body-sm">
                  {each.lines.map((line) => (
                    <li key={line.lineId} className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span>
                        {formatNumber(line.quantity, 3)} {line.unit} · {line.itemName}
                      </span>
                      <span className="font-number text-fg-muted">{m.purchase_at({ cost: formatMoney(line.unitCost) })}</span>
                    </li>
                  ))}
                </ul>
                {form !== 'receive' && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {board.may.move && (
                      <Button
                        disabled={busy}
                        onClick={() => {
                          show('receive', each.purchaseId);
                          setArrived(
                            Object.fromEntries(
                              each.lines.map((line) => [line.lineId, { quantity: String(line.quantity), unitCost: String(line.unitCost) }]),
                            ),
                          );
                        }}
                      >
                        {m.purchase_receive()}
                      </Button>
                    )}
                    {board.may.order && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void run(() => cancelPurchase({ data: { purchaseId: each.purchaseId } }), m.purchase_cancelled({ number: each.number }))}
                      >
                        {m.purchase_cancel()}
                      </Button>
                    )}
                  </div>
                )}
                {form === 'receive' && purchase?.purchaseId === each.purchaseId && (
                  <div className="mt-3 flex max-w-xl flex-col gap-4">
                    <p className="text-body-sm text-fg-muted">{m.purchase_receive_hint()}</p>
                    {each.lines.map((line) => (
                      <div key={line.lineId} className="flex flex-wrap items-end gap-3">
                        <TextField
                          className="min-w-32 flex-1"
                          label={m.purchase_arrived({ name: line.itemName, unit: line.unit })}
                          inputMode="decimal"
                          value={arrived[line.lineId]?.quantity ?? ''}
                          onChange={(event) =>
                            setArrived((current) => ({
                              ...current,
                              [line.lineId]: { quantity: event.target.value, unitCost: current[line.lineId]?.unitCost ?? '0' },
                            }))
                          }
                        />
                        <TextField
                          className="min-w-32 flex-1"
                          label={m.purchase_real_cost({ name: line.itemName })}
                          inputMode="numeric"
                          value={arrived[line.lineId]?.unitCost ?? ''}
                          onChange={(event) =>
                            setArrived((current) => ({
                              ...current,
                              [line.lineId]: { quantity: current[line.lineId]?.quantity ?? '0', unitCost: event.target.value },
                            }))
                          }
                        />
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-3">
                      <Button
                        disabled={
                          busy ||
                          each.lines.some(
                            (line) => number(arrived[line.lineId]?.quantity ?? '') === null || !/^\d+$/.test((arrived[line.lineId]?.unitCost ?? '').trim()),
                          )
                        }
                        onClick={() =>
                          void run(
                            () =>
                              receivePurchase({
                                data: {
                                  purchaseId: each.purchaseId,
                                  lines: each.lines.map((line) => ({
                                    lineId: line.lineId,
                                    quantity: number(arrived[line.lineId]?.quantity ?? '') ?? 0,
                                    unitCost: Number(arrived[line.lineId]?.unitCost ?? 0),
                                  })),
                                },
                              }),
                            m.purchase_received({ number: each.number, supplier: each.supplierName }),
                          )
                        }
                      >
                        {m.purchase_receive()}
                      </Button>
                      {cancel}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {closed.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5 text-body-sm">
            {closed.map((each) => (
              <li key={each.purchaseId} className="flex flex-wrap items-baseline gap-x-3">
                <Tag tone={each.status === 'received' ? 'validated' : 'neutral'}>
                  {each.status === 'received' ? m.purchase_status_received() : m.purchase_status_cancelled()}
                </Tag>
                <span>
                  {each.number} · {each.supplierName}
                </span>
              </li>
            ))}
          </ul>
        )}
        {board.may.order && form === null && suppliers.length > 0 && items.length > 0 && (
          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={() => {
                show('order', suppliers[0]?.supplierId ?? '');
                setItemId(items[0]?.itemId ?? '');
                setLines([]);
              }}
            >
              {m.purchase_new()}
            </Button>
          </div>
        )}
        {form === 'order' && (
          <div className="mt-3 flex max-w-xl flex-col gap-4">
            <SelectField
              label={m.purchase_supplier()}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              options={suppliers.map((each) => ({ value: each.supplierId, label: each.name }))}
            />
            <SelectField
              label={m.purchase_item()}
              value={itemId}
              onChange={(event) => setItemId(event.target.value)}
              options={items.map((each) => ({ value: each.itemId, label: `${each.name} (${each.unit})` }))}
            />
            <TextField label={m.purchase_quantity()} inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            <TextField label={m.purchase_unit_cost()} inputMode="numeric" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} />
            <div>
              <Button
                variant="secondary"
                disabled={!itemId || typedQuantity === null || typedQuantity <= 0 || typedCost === null || lines.some((line) => line.itemId === itemId)}
                onClick={() => {
                  setLines((current) => [...current, { itemId, quantity, unitCost }]);
                  setQuantity('');
                  setUnitCost('');
                }}
              >
                {m.purchase_add_line()}
              </Button>
            </div>
            {lines.length > 0 && (
              <ul className="flex flex-col divide-y divide-line rounded-box border border-line bg-surface">
                {lines.map((line) => (
                  <li key={line.itemId} className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-3">
                    <span>
                      {line.quantity} {itemName(line.itemId)?.unit} · {itemName(line.itemId)?.name}
                    </span>
                    <span className="font-number">{formatMoney(Math.round((number(line.quantity) ?? 0) * Number(line.unitCost)))}</span>
                  </li>
                ))}
                <li className="flex items-baseline justify-between gap-3 px-4 py-3 font-semibold">
                  <span>{m.order_total()}</span>
                  <span className="font-number">{formatMoney(orderTotal)}</span>
                </li>
              </ul>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy || !target || lines.length === 0}
                onClick={() =>
                  void run(
                    () =>
                      orderPurchase({
                        data: {
                          supplierId: target,
                          lines: lines.map((line) => ({
                            itemId: line.itemId,
                            quantity: number(line.quantity) ?? 0,
                            unitCost: Number(line.unitCost),
                          })),
                        },
                      }),
                    m.purchase_ordered(),
                  )
                }
              >
                {m.purchase_save()}
              </Button>
              {cancel}
            </div>
          </div>
        )}
      </PageSection>

      <PageSection title={m.suppliers_title()}>
        <p className="mb-3">
          <span className="text-fg-muted">{m.suppliers_owed()}</span>{' '}
          <span className="font-number font-semibold">{formatMoney(board.owed)}</span>
        </p>
        {board.suppliers.length === 0 ? (
          <p className="text-fg-muted">{m.suppliers_none()}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-box border border-line bg-surface">
            {board.suppliers.map((each) => (
              <li key={each.supplierId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="font-semibold">{each.name}</span>
                  {each.phone && <span className="block font-number text-body-sm text-fg-muted">{each.phone}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  <span className="font-number">{each.owed > 0 ? m.supplier_owed({ amount: formatMoney(each.owed) }) : m.supplier_nothing_owed()}</span>
                  {board.may.pay && each.owed > 0 && (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        show('pay', each.supplierId);
                        setAmount(String(each.owed));
                      }}
                    >
                      {m.supplier_pay({ name: each.name })}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {board.may.manage && form === null && (
          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={() => {
                show('supplier');
                setName('');
                setPhone('');
              }}
            >
              {m.supplier_add()}
            </Button>
          </div>
        )}
        {form === 'supplier' && (
          <div className="mt-3 flex max-w-xl flex-col gap-4">
            <TextField label={m.supplier_name()} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
            <TextField label={m.customer_phone()} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy || name.trim() === ''}
                onClick={() => void run(() => saveSupplier({ data: { name, phone, note: '', active: true } }), m.supplier_saved({ name }))}
              >
                {m.supplier_save()}
              </Button>
              {cancel}
            </div>
          </div>
        )}
        {form === 'pay' && supplier && (
          <div className="mt-3 flex max-w-xl flex-col gap-4">
            <TextField
              label={m.money_amount()}
              hint={m.supplier_owed({ amount: formatMoney(supplier.owed) })}
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <SelectField
              label={m.supplier_paid_from()}
              hint={m.supplier_paid_from_hint()}
              value={paidFrom}
              onChange={(event) => setPaidFrom(event.target.value as PaidFrom)}
              options={(Object.keys(paidFromWords) as PaidFrom[]).map((value) => ({ value, label: paidFromWords[value]() }))}
            />
            <div className="flex flex-wrap gap-3">
              <Button disabled={busy || typedAmount === null || typedAmount <= 0} onClick={() => setConfirming(true)}>
                {m.supplier_pay({ name: supplier.name })}
              </Button>
              {cancel}
            </div>
          </div>
        )}
      </PageSection>

      {consumption && (
        <PageSection title={m.consumption_title({ month: formatMonth(consumption.month) })}>
          <dl className="grid max-w-xl grid-cols-3 gap-2">
            <div>
              <dt className="text-body-sm text-fg-muted">{m.consumption_planned()}</dt>
              <dd className="font-number font-semibold">{formatMoney(consumption.planned)}</dd>
            </div>
            <div>
              <dt className="text-body-sm text-fg-muted">{m.consumption_used()}</dt>
              <dd className="font-number font-semibold">{formatMoney(consumption.used)}</dd>
            </div>
            <div>
              <dt className="text-body-sm text-fg-muted">{m.consumption_gap()}</dt>
              <dd className="font-number font-semibold">{formatSigned(consumption.gap)}</dd>
            </div>
          </dl>
          <p className="mt-3 max-w-3xl text-body-sm text-fg-muted">
            {m.consumption_how({ coverage: formatNumber(Math.round(consumption.coverage * 100)) })}
            {consumption.unpriced.length > 0 && ` ${m.consumption_unpriced({ names: consumption.unpriced.join(', ') })}`}
          </p>
        </PageSection>
      )}

      {board.moves.length > 0 && (
        <PageSection title={m.stock_moves()}>
          <ul className="flex flex-col gap-1.5 text-body-sm">
            {board.moves.slice(0, 15).map((move, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a movement is never changed nor moved
              <li key={index} className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span>
                  <span className="font-number text-fg-muted">{formatDay(move.createdAt)}</span>{' '}
                  {{ reception: m.move_reception, use: m.move_use, count: m.move_count, loss: m.move_loss }[move.kind]()} · {move.itemName}
                  {move.note && <span className="text-fg-muted"> · {move.note}</span>}
                </span>
                <span className="font-number">
                  {move.quantity > 0 ? '+ ' : '− '}
                  {formatNumber(Math.abs(move.quantity), 3)} {move.unit}
                </span>
              </li>
            ))}
          </ul>
        </PageSection>
      )}

      <ConfirmDialog
        open={confirming && supplier !== undefined}
        title={m.review_confirm_title()}
        confirmLabel={supplier ? m.supplier_pay({ name: supplier.name }) : ''}
        cancelLabel={m.action_close()}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          if (!supplier || typedAmount === null) return;
          setConfirming(false);
          void run(
            () => paySupplier({ data: { key, payment: { supplierId: supplier.supplierId, amount: typedAmount, paidFrom } } }),
            m.supplier_paid({ amount: formatMoney(typedAmount), name: supplier.name }),
          );
        }}
      >
        {supplier ? m.supplier_pay_confirm({ amount: formatMoney(typedAmount ?? 0), name: supplier.name }) : ''}
      </ConfirmDialog>
    </>
  );
}
