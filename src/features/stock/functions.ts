import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { perform } from '@/platform/screen';
import type { StockBoard, StockConsumption } from './capabilities';
import type { StockState } from './domain/stock';
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

const key = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/);

export const fetchStock = createServerFn({ method: 'GET' }).handler(async () => {
  const read = await perform<StockBoard>('stock_board', {});
  return read.ok ? read.output : null;
});

export const fetchStockAlerts = createServerFn({ method: 'GET' }).handler(async () => {
  const read = await perform<{ items: { itemId: string; name: string; unit: string; level: number; state: StockState }[] }>(
    'stock_alerts',
    {},
  );
  return read.ok ? read.output.items : [];
});

export const fetchConsumption = createServerFn({ method: 'GET' })
  .validator((input: unknown) => monthInput.parse(input))
  .handler(async ({ data }) => {
    const read = await perform<StockConsumption>('stock_consumption', data);
    return read.ok ? read.output : null;
  });

export const saveItem = createServerFn({ method: 'POST' })
  .validator((input: unknown) => itemInput.parse(input))
  .handler(({ data }) => perform<{ itemId: string; name: string }>('stock_set_item', data));

export const useItem = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ key, use: useInput }).parse(input))
  .handler(({ data }) => perform<{ name: string; unit: string; left: number }>('stock_use', data.use, data.key));

export const countItems = createServerFn({ method: 'POST' })
  .validator((input: unknown) => countInput.parse(input))
  .handler(({ data }) =>
    perform<{ counted: number; gaps: { name: string; unit: string; gap: number }[] }>('stock_count', data),
  );

export const saveSupplier = createServerFn({ method: 'POST' })
  .validator((input: unknown) => supplierInput.parse(input))
  .handler(({ data }) => perform<{ supplierId: string; name: string }>('suppliers_set', data));

export const orderPurchase = createServerFn({ method: 'POST' })
  .validator((input: unknown) => purchaseInput.parse(input))
  .handler(({ data }) => perform<{ purchaseId: string; number: string; total: number }>('purchases_order', data));

export const receivePurchase = createServerFn({ method: 'POST' })
  .validator((input: unknown) => receptionInput.parse(input))
  .handler(({ data }) => perform<{ number: string; supplier: string; owed: number }>('purchases_receive', data));

export const cancelPurchase = createServerFn({ method: 'POST' })
  .validator((input: unknown) => purchaseRef.parse(input))
  .handler(({ data }) => perform<{ number: string }>('purchases_cancel', data));

export const paySupplier = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ key, payment: supplierPaymentInput }).parse(input))
  .handler(({ data }) => perform<{ name: string; paid: number; owed: number }>('suppliers_pay', data.payment, data.key));
