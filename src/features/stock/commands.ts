import { defineCommand } from '@kete/commands';
import { recordExpense } from '@/features/money/commands';
import { personBehind } from '@/lib/actor';
import { RuleError } from '@/lib/rule-error';
import { checkReception, checkSupplierPayment, checkUse, countGap, debtOf, purchaseNumber, purchaseTotal } from './domain/stock';
import {
  closePurchase,
  findPurchase,
  insertMove,
  insertPurchase,
  insertSupplierPayment,
  listStock,
  listSuppliers,
  lockItem,
  lockSupplier,
  saveItem,
  saveSupplier,
} from './infrastructure/stock.tables';
import {
  countInput,
  itemInput,
  purchaseInput,
  purchaseRef,
  receptionInput,
  supplierInput,
  supplierPaymentInput,
  useInput,
} from './stock.record';

const today = (): string => new Date().toISOString().slice(0, 10);

/** A consumable the laundry keeps, its unit, and the level under which it wants to be told. */
export const setStockItem = defineCommand({
  name: 'set-stock-item',
  input: itemInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    const itemId = await saveItem(db, organizationId, input);
    if (itemId === null) throw new RuleError('stock_name_taken');
    if (itemId === '') throw new RuleError('not_found');
    return { itemId, name: input.name };
  },
  summarize: (_input, output) => `Stock item ${output.name}`,
});

export const setSupplier = defineCommand({
  name: 'set-supplier',
  input: supplierInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    const supplierId = await saveSupplier(db, organizationId, input);
    if (supplierId === null) throw new RuleError('supplier_name_taken');
    if (supplierId === '') throw new RuleError('not_found');
    return { supplierId, name: input.name };
  },
  summarize: (_input, output) => `Supplier ${output.name}`,
});

/** An order to a supplier: what is wanted, at what it should cost. Nothing is in stock yet. */
export const orderPurchase = defineCommand({
  name: 'order-purchase',
  input: purchaseInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    if (!(await listSuppliers(db, input.supplierId))[0]?.active) throw new RuleError('not_found');
    const items = new Set((await listStock(db)).filter((item) => item.active).map((item) => item.itemId));
    if (input.lines.some((line) => !items.has(line.itemId))) throw new RuleError('not_found');
    if (new Set(input.lines.map((line) => line.itemId)).size !== input.lines.length) throw new RuleError('invalid_input');
    const purchase = await insertPurchase(db, organizationId, {
      numberOf: purchaseNumber,
      supplierId: input.supplierId,
      note: input.note,
      createdBy: personBehind(actor),
      lines: input.lines,
    });
    return { ...purchase, total: purchaseTotal(input.lines) };
  },
  summarize: (_input, output) => `Purchase order ${output.number}: ${output.total}`,
});

/**
 * The goods arrive: what really came enters the stock at what it really cost — and from then on
 * the laundry owes it to its supplier.
 */
export const receivePurchase = defineCommand({
  name: 'receive-purchase',
  input: receptionInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const purchase = await findPurchase(db, input.purchaseId, true);
    if (!purchase) throw new RuleError('not_found');
    checkReception(
      purchase.status,
      purchase.lines.map((line) => line.lineId),
      input.lines,
    );
    const arrived = input.lines.filter((line) => line.quantity > 0);
    for (const line of arrived) {
      const ordered = purchase.lines.find((each) => each.lineId === line.lineId);
      if (!ordered) throw new RuleError('not_found');
      await lockItem(db, ordered.itemId);
      await insertMove(db, organizationId, {
        itemId: ordered.itemId,
        kind: 'reception',
        quantity: line.quantity,
        unitCost: line.unitCost,
        purchaseId: purchase.purchaseId,
        note: purchase.number,
        createdBy: personBehind(actor),
      });
    }
    await closePurchase(db, purchase.purchaseId, { status: 'received', receivedBy: personBehind(actor), lines: arrived });
    return { number: purchase.number, supplier: purchase.supplierName, owed: purchaseTotal(arrived) };
  },
  summarize: (_input, output) => `Purchase ${output.number} received: ${output.owed} owed to ${output.supplier}`,
});

export const cancelPurchase = defineCommand({
  name: 'cancel-purchase',
  input: purchaseRef,
  reversibility: { reversible: false },
  async handler(input, { db }) {
    const purchase = await findPurchase(db, input.purchaseId, true);
    if (!purchase) throw new RuleError('not_found');
    if (purchase.status !== 'ordered') throw new RuleError('purchase_not_open');
    await closePurchase(db, purchase.purchaseId, { status: 'cancelled' });
    return { number: purchase.number };
  },
  summarize: (_input, output) => `Purchase ${output.number} cancelled`,
});

/** What leaves a shelf: used for the work, or lost. Never more than the shelf holds. */
export const useStock = defineCommand({
  name: 'use-stock',
  input: useInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    if (!(await lockItem(db, input.itemId))) throw new RuleError('not_found');
    const [item] = await listStock(db, input.itemId);
    if (!item) throw new RuleError('not_found');
    checkUse(input.quantity, item.level);
    await insertMove(db, organizationId, {
      itemId: item.itemId,
      kind: input.loss ? 'loss' : 'use',
      quantity: -input.quantity,
      note: input.note,
      createdBy: personBehind(actor),
    });
    return { name: item.name, unit: item.unit, left: Math.round((item.level - input.quantity) * 1000) / 1000 };
  },
  summarize: (input, output) => `${input.quantity} ${output.unit} of ${output.name} ${input.loss ? 'lost' : 'used'}`,
});

/** An inventory: what was counted becomes the level; the gap is kept as a movement, never hidden. */
export const countStock = defineCommand({
  name: 'count-stock',
  input: countInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    if (new Set(input.counts.map((count) => count.itemId)).size !== input.counts.length) throw new RuleError('invalid_input');
    const gaps: { name: string; unit: string; gap: number }[] = [];
    for (const count of input.counts) {
      if (!(await lockItem(db, count.itemId))) throw new RuleError('not_found');
      const [item] = await listStock(db, count.itemId);
      if (!item) throw new RuleError('not_found');
      const gap = countGap(count.counted, item.level);
      if (gap === 0) continue;
      await insertMove(db, organizationId, {
        itemId: item.itemId,
        kind: 'count',
        quantity: gap,
        createdBy: personBehind(actor),
      });
      gaps.push({ name: item.name, unit: item.unit, gap });
    }
    return { counted: input.counts.length, gaps };
  },
  summarize: (_input, output) => `Inventory: ${output.counted} counted, ${output.gaps.length} gap(s)`,
});

/**
 * Pays a supplier, never more than what is owed. The payment is an expense like any other — it
 * goes through the till's rules and counts in the month — so that the money stays true.
 */
export const paySupplier = defineCommand({
  name: 'pay-supplier',
  input: supplierPaymentInput,
  reversibility: { reversible: false },
  async handler(input, context) {
    const { db, organizationId, actor } = context;
    if (!(await lockSupplier(db, input.supplierId))) throw new RuleError('not_found');
    const [supplier] = await listSuppliers(db, input.supplierId);
    if (!supplier) throw new RuleError('not_found');
    checkSupplierPayment(input.amount, debtOf(supplier.received, supplier.paid));
    const { expenseId } = await recordExpense.handler(
      {
        spentOn: today(),
        label: supplier.name,
        category: input.category,
        behavior: 'variable',
        amount: input.amount,
        paidFrom: input.paidFrom,
        siteId: input.siteId,
        recurring: false,
        paidTo: null,
      },
      context,
    );
    await insertSupplierPayment(db, organizationId, {
      supplierId: supplier.supplierId,
      amount: input.amount,
      expenseId,
      paidOn: today(),
      createdBy: personBehind(actor),
    });
    return { name: supplier.name, paid: input.amount, owed: debtOf(supplier.received, supplier.paid) - input.amount };
  },
  summarize: (_input, output) => `${output.paid} paid to ${output.name}`,
});
