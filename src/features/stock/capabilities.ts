import { defineCapability } from '@kete/capabilities';
import { z } from 'zod';
import { monthFigures } from '@/features/money';
import { sheetKey } from '@/features/money/domain/costs';
import { monthPeriod } from '@/features/money/domain/charges';
import { holds } from '@/platform/rights';
import {
  cancelPurchase,
  countStock,
  orderPurchase,
  paySupplier,
  receivePurchase,
  setStockItem,
  setSupplier,
  useStock,
} from './commands';
import { averageCost, consumption, debtOf, stateOf, type StockState } from './domain/stock';
import {
  latestMoves,
  listPurchases,
  listStock,
  listSuppliers,
  usedIn,
  type Purchase,
  type StockMove,
} from './infrastructure/stock.tables';
import {
  countInput,
  itemInput,
  monthInput,
  purchaseInput,
  purchaseRef,
  receptionInput,
  supplierInput,
  supplierPaymentInput,
  useInput,
} from './stock.record';

export interface StockBoard {
  items: {
    itemId: string;
    name: string;
    unit: string;
    threshold: number;
    active: boolean;
    level: number;
    state: StockState;
    /** What a unit cost on average; null while nothing was received with a cost. */
    averageCost: number | null;
    value: number | null;
  }[];
  suppliers: { supplierId: string; name: string; phone: string; note: string; active: boolean; owed: number }[];
  purchases: Purchase[];
  moves: StockMove[];
  /** What the laundry owes its suppliers in all. */
  owed: number;
  may: { manage: boolean; move: boolean; order: boolean; pay: boolean };
}

export interface StockConsumption {
  month: string;
  /** What the cost sheets planned in consumables for the volume treated. */
  planned: number;
  /** The value of what left the shelves: uses and losses at average cost. */
  used: number;
  gap: number;
  /** The part of the volume a cost sheet covers. */
  coverage: number;
  /** What left the shelves without a known cost: counted in no value. */
  unpriced: string[];
}

const thisMonth = (): string => new Date().toISOString().slice(0, 7);

/**
 * What a screen, a copilot or an agent may do with stock and purchasing. Reading is level 1. A
 * movement, an order or a payment commits the laundry or its money: an agent only prepares it; a
 * payment asks the person once more.
 */
export const stockCapabilities = [
  defineCapability({
    name: 'stock_board',
    description:
      'The consumables the laundry keeps: level, unit, threshold, state (ok, low, out), average cost and value; its suppliers and what it owes each; its purchase orders, open first; the latest movements.',
    permission: 'stock:read',
    autonomy: 1,
    classification: 'confidential',
    input: z.object({}),
    async run(_input, { db }): Promise<StockBoard> {
      const suppliers = (await listSuppliers(db)).map((supplier) => ({
        supplierId: supplier.supplierId,
        name: supplier.name,
        phone: supplier.phone,
        note: supplier.note,
        active: supplier.active,
        owed: debtOf(supplier.received, supplier.paid),
      }));
      return {
        items: (await listStock(db)).map((item) => {
          const cost = averageCost([{ quantity: item.pricedQuantity, unitCost: item.pricedQuantity > 0 ? item.pricedValue / item.pricedQuantity : null }]);
          return {
            itemId: item.itemId,
            name: item.name,
            unit: item.unit,
            threshold: item.threshold,
            active: item.active,
            level: item.level,
            state: stateOf(item.level, item.threshold),
            averageCost: cost,
            value: cost === null ? null : Math.round(Math.max(0, item.level) * cost),
          };
        }),
        suppliers,
        purchases: await listPurchases(db),
        moves: await latestMoves(db),
        owed: suppliers.reduce((sum, supplier) => sum + supplier.owed, 0),
        may: {
          manage: holds('stock:manage'),
          move: holds('stock:move'),
          order: holds('purchases:order'),
          pay: holds('suppliers:pay'),
        },
      };
    },
  }),
  defineCapability({
    name: 'stock_alerts',
    description: 'The consumables at or under the laundry’s own threshold, or out: what to order before the work stops.',
    permission: 'stock:read',
    autonomy: 1,
    input: z.object({}),
    async run(_input, { db }) {
      return {
        items: (await listStock(db))
          .filter((item) => item.active && stateOf(item.level, item.threshold) !== 'ok' && (item.threshold > 0 || item.level <= 0))
          .map((item) => ({
            itemId: item.itemId,
            name: item.name,
            unit: item.unit,
            level: item.level,
            threshold: item.threshold,
            state: stateOf(item.level, item.threshold),
          })),
      };
    },
  }),
  defineCapability({
    name: 'stock_consumption',
    description:
      'For a month (the current one by default): what the cost sheets planned in consumables for the volume treated, against the value of what really left the shelves — and the gap. Computed by code; what has no known cost is said, not estimated.',
    permission: 'money:read',
    autonomy: 1,
    classification: 'confidential',
    input: monthInput,
    async run(input, { db }): Promise<StockConsumption> {
      const month = input.month ?? thisMonth();
      const figures = await monthFigures(db, month);
      const stock = new Map((await listStock(db)).map((item) => [item.itemId, item]));
      const unpriced: string[] = [];
      let used = 0;
      for (const move of await usedIn(db, monthPeriod(month))) {
        const item = stock.get(move.itemId);
        if (!item) continue;
        if (item.pricedQuantity <= 0) unpriced.push(item.name);
        else used += (move.quantity * item.pricedValue) / item.pricedQuantity;
      }
      return {
        month,
        ...consumption({
          lines: figures.content.lines,
          planned: new Map(figures.stored.map((sheet) => [sheetKey(sheet.serviceId, sheet.articleId), sheet.consumablesCost])),
          used: Math.round(used),
        }),
        unpriced,
      };
    },
  }),
  defineCapability({
    name: 'stock_set_item',
    description: 'Creates or changes a consumable: its name, its unit, the level under which the laundry wants to be told.',
    permission: 'stock:manage',
    autonomy: 3,
    input: itemInput,
    command: setStockItem,
    draft: { recordType: 'stock_item' },
  }),
  defineCapability({
    name: 'stock_use',
    description: 'Takes a quantity out of a shelf: used for the work, or lost. Never more than the shelf holds.',
    permission: 'stock:move',
    autonomy: 3,
    input: useInput,
    command: useStock,
    draft: { recordType: 'stock_use' },
  }),
  defineCapability({
    name: 'stock_count',
    description: 'Records an inventory: what was counted becomes the level, and each gap is kept as a movement.',
    permission: 'stock:manage',
    autonomy: 3,
    input: countInput,
    command: countStock,
    draft: { recordType: 'stock_count' },
  }),
  defineCapability({
    name: 'suppliers_set',
    description: 'Creates or changes a supplier.',
    permission: 'stock:manage',
    autonomy: 3,
    input: supplierInput,
    command: setSupplier,
    draft: { recordType: 'supplier' },
  }),
  defineCapability({
    name: 'purchases_order',
    description: 'Writes a purchase order to a supplier: consumables, quantities, the cost expected. Nothing enters the stock yet.',
    permission: 'purchases:order',
    autonomy: 3,
    input: purchaseInput,
    command: orderPurchase,
    draft: { recordType: 'purchase_order' },
  }),
  defineCapability({
    name: 'purchases_receive',
    description:
      'Receives a purchase order: what really arrived enters the stock at what it really cost, and the laundry owes it to the supplier.',
    permission: 'stock:move',
    autonomy: 3,
    input: receptionInput,
    command: receivePurchase,
    draft: { recordType: 'purchase_reception' },
  }),
  defineCapability({
    name: 'purchases_cancel',
    description: 'Cancels a purchase order that was not received.',
    permission: 'purchases:order',
    autonomy: 3,
    input: purchaseRef,
    command: cancelPurchase,
    draft: { recordType: 'purchase_cancellation' },
  }),
  defineCapability({
    name: 'suppliers_pay',
    description:
      'Pays a supplier, never more than what is owed: recorded as an expense of the day, under the till’s rules when paid from it.',
    permission: 'suppliers:pay',
    autonomy: 4,
    input: supplierPaymentInput,
    command: paySupplier,
    draft: { recordType: 'supplier_payment' },
  }),
];
