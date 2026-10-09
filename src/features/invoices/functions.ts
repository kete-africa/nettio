import { createServerFn } from '@tanstack/react-start';
import { perform } from '@/platform/screen';
import type { InvoiceStatus } from './domain/invoice';
import {
  accountInput,
  cashInput,
  creditInput,
  getInput,
  issueInput,
  listInput,
  ofOrderInput,
  settingsInput,
  type CustomerAccount,
  type Invoice,
  type InvoiceSettings,
  type InvoiceSummary,
} from './invoice.record';

/** The invoices, for whoever may read them; null otherwise. */
export const fetchInvoices = createServerFn({ method: 'GET' })
  .validator((input: unknown) => listInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<InvoiceSummary[] | null> => {
    const read = await perform<InvoiceSummary[]>('invoices_list', data);
    return read.ok ? read.output : null;
  });

export interface InvoiceView {
  invoice: Invoice;
  status: InvoiceStatus;
  due: number;
}

export const fetchInvoice = createServerFn({ method: 'GET' })
  .validator((input: unknown) => getInput.parse(input))
  .handler(async ({ data }): Promise<InvoiceView | null> => {
    const read = await perform<InvoiceView>('invoices_get', data);
    return read.ok ? read.output : null;
  });

export const fetchInvoiceOfOrder = createServerFn({ method: 'GET' })
  .validator((input: unknown) => ofOrderInput.parse(input))
  .handler(async ({ data }) => {
    const read = await perform<{ invoice: { invoiceId: string; number: string } | null }>(
      'invoices_of_order',
      data,
    );
    return read.ok ? { allowed: true, invoice: read.output.invoice } : { allowed: false, invoice: null };
  });

export const fetchAccount = createServerFn({ method: 'GET' })
  .validator((input: unknown) => accountInput.parse(input))
  .handler(async ({ data }): Promise<CustomerAccount | null> => {
    const read = await perform<CustomerAccount>('invoices_account', data);
    return read.ok ? read.output : null;
  });

export const fetchInvoiceSettings = createServerFn({ method: 'GET' }).handler(
  async (): Promise<InvoiceSettings | null> => {
    const read = await perform<InvoiceSettings>('invoices_settings', {});
    return read.ok ? read.output : null;
  },
);

export const issueInvoice = createServerFn({ method: 'POST' })
  .validator((input: unknown) => issueInput.parse(input))
  .handler(({ data }) =>
    perform<{ invoiceId: string; number: string; total: number }>('invoices_issue', data),
  );

export const creditInvoice = createServerFn({ method: 'POST' })
  .validator((input: unknown) => creditInput.parse(input))
  .handler(({ data }) =>
    perform<{ invoiceId: string; number: string; credits: string }>('invoices_credit', data),
  );

export const cashInvoice = createServerFn({ method: 'POST' })
  .validator((input: unknown) => cashInput.extend({ key: ofOrderInput.shape.orderId }).parse(input))
  .handler(({ data: { key, ...payment } }) =>
    perform<{ invoiceId: string; number: string; paid: number; due: number }>(
      'invoices_cash',
      payment,
      key,
    ),
  );

export const saveInvoiceSettings = createServerFn({ method: 'POST' })
  .validator((input: unknown) => settingsInput.parse(input))
  .handler(({ data }) => perform<{ vatPercent: number }>('invoices_set_settings', data));
