import { z } from 'zod';
import { paymentMethods } from '@/features/orders';
import type { InvoiceKind, InvoiceLine } from './domain/invoice';

// The inputs of the invoices' gestures — one schema each, shared by the screen, the server and the
// MCP tool — and what an invoice is, read.

const id = z.string().min(1).max(64);

export const issueInput = z.object({
  /** The deposits to bill: one, or several of the same customer (a company at the month's end). */
  orderIds: z.array(id).min(1).max(200),
});

export const creditInput = z.object({
  invoiceId: id,
  /** Why the invoice is cancelled: kept on the credit note. */
  reason: z.string().trim().min(1).max(300),
});

export const cashInput = z.object({
  invoiceId: id,
  amount: z.number().int().min(1).max(1_000_000_000),
  method: z.enum(paymentMethods),
});

export const settingsInput = z.object({
  legalName: z.string().trim().max(160).default(''),
  /** NIF. */
  taxId: z.string().trim().max(40).default(''),
  /** RCCM. */
  tradeRegister: z.string().trim().max(60).default(''),
  address: z.string().trim().max(300).default(''),
  footer: z.string().trim().max(500).default(''),
  /** 0: the laundry charges no VAT. */
  vatPercent: z.number().min(0).max(50).default(0),
  paymentDays: z.number().int().min(0).max(120).default(15),
});

export const listInput = z.object({
  customerId: id.optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

export const getInput = z.object({ invoiceId: id });
export const accountInput = z.object({ customerId: id });
export const ofOrderInput = z.object({ orderId: id });
export const emptyInput = z.object({});

export type InvoiceSettings = z.infer<typeof settingsInput>;

/** The laundry as it was printed on an invoice. */
export interface Seller {
  name: string;
  legalName: string;
  taxId: string;
  tradeRegister: string;
  address: string;
  footer: string;
}

export interface InvoiceSummary {
  invoiceId: string;
  kind: InvoiceKind;
  number: string;
  customerId: string;
  customerName: string;
  issuedOn: string;
  dueOn: string | null;
  /** Negative for a credit note. */
  total: number;
  /** What its deposits were paid, while it bills them. */
  paid: number;
  /** A credit note cancelled it. */
  credited: boolean;
}

export interface Invoice extends InvoiceSummary {
  customerPhone: string;
  /** A company's own mentions — tax number, address —, one per line. */
  customerMentions: string;
  seller: Seller;
  vatPercent: number;
  net: number;
  vat: number;
  reason: string;
  /** For a credit note: the invoice it cancels. */
  creditsInvoiceId: string | null;
  creditsNumber: string | null;
  /** For an invoice: the credit note that cancelled it. */
  creditedBy: string | null;
  creditedByNumber: string | null;
  lines: InvoiceLine[];
}

/** A customer's account: what is billed, what is paid, what is not billed yet. */
export interface CustomerAccount {
  invoices: InvoiceSummary[];
  /** Deposits on no invoice. */
  uninvoiced: { orderId: string; number: string; total: number; paid: number; createdAt: Date }[];
  /** What the customer owes in all: invoices still due, and deposits not billed. */
  due: number;
}
