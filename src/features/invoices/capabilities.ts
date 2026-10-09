import { defineCapability } from '@kete/capabilities';
import { RuleError } from '@/lib/rule-error';
import { cashInvoice, creditInvoice, issueInvoice, setInvoiceSettings } from './commands';
import { statusOf } from './domain/invoice';
import {
  findInvoice,
  invoiceOfOrder,
  listInvoices,
  readInvoiceSettings,
  uninvoicedOrders,
} from './infrastructure/invoices.tables';
import {
  accountInput,
  cashInput,
  creditInput,
  emptyInput,
  getInput,
  issueInput,
  listInput,
  ofOrderInput,
  settingsInput,
  type CustomerAccount,
} from './invoice.record';

/**
 * What a screen, a copilot or an agent may do with invoices. Reading is level 1. An invoice and a
 * credit note commit the laundry: an agent prepares them (level 3), a person decides. Cashing is
 * money: always a person (level 4).
 */
export const invoiceCapabilities = [
  defineCapability({
    name: 'invoices_list',
    description:
      'The invoices and credit notes, the latest first, or those of one customer: number, customer, date, due date, total, what was paid, whether a credit note cancelled it.',
    permission: 'invoices:read',
    autonomy: 1,
    classification: 'confidential',
    input: listInput,
    run: (input, { db }) => listInvoices(db, input),
  }),
  defineCapability({
    name: 'invoices_get',
    description:
      'One invoice or credit note in full: the laundry’s mentions, the customer, its lines, the tax inside the total when the laundry charges VAT, what was paid, what is due, its status (due, paid, credited).',
    permission: 'invoices:read',
    autonomy: 1,
    classification: 'confidential',
    input: getInput,
    async run(input, { db }) {
      const invoice = await findInvoice(db, input.invoiceId);
      if (!invoice) throw new RuleError('not_found');
      return {
        invoice,
        status: statusOf(invoice),
        due: invoice.kind === 'invoice' && !invoice.credited ? invoice.total - invoice.paid : 0,
      };
    },
  }),
  defineCapability({
    name: 'invoices_of_order',
    description: 'The invoice that bills a deposit, if one does.',
    permission: 'invoices:read',
    autonomy: 1,
    input: ofOrderInput,
    async run(input, { db }) {
      return { invoice: await invoiceOfOrder(db, input.orderId) };
    },
  }),
  defineCapability({
    name: 'invoices_account',
    description:
      'A customer’s account: her invoices with what was paid, her deposits that are on no invoice yet, and what she owes in all. Figures computed by code.',
    permission: 'invoices:read',
    autonomy: 1,
    classification: 'confidential',
    input: accountInput,
    async run(input, { db }): Promise<CustomerAccount> {
      const invoices = await listInvoices(db, { customerId: input.customerId, limit: 200 });
      const uninvoiced = await uninvoicedOrders(db, input.customerId);
      const billed = invoices
        .filter((invoice) => invoice.kind === 'invoice' && !invoice.credited)
        .reduce((sum, invoice) => sum + (invoice.total - invoice.paid), 0);
      return {
        invoices,
        uninvoiced: uninvoiced.map((order) => ({
          orderId: order.orderId,
          number: order.number,
          total: order.total,
          paid: order.paid,
          createdAt: order.createdAt,
        })),
        due: billed + uninvoiced.reduce((sum, order) => sum + (order.total - order.paid), 0),
      };
    },
  }),
  defineCapability({
    name: 'invoices_settings',
    description:
      'What the laundry prints on its invoices (legal name, NIF, RCCM, address, footer), its VAT rate (0: it charges none) and its payment delay in days.',
    permission: 'invoices:read',
    autonomy: 1,
    input: emptyInput,
    run: (_input, { db }) => readInvoiceSettings(db),
  }),
  defineCapability({
    name: 'invoices_issue',
    description:
      'Issues an invoice for one deposit, or for several deposits of the same customer (a company at the month’s end). Its number follows the last one; it is never changed afterwards.',
    permission: 'invoices:issue',
    autonomy: 3,
    input: issueInput,
    command: issueInvoice,
    draft: { recordType: 'invoice' },
  }),
  defineCapability({
    name: 'invoices_credit',
    description:
      'Cancels an invoice with a credit note, with a reason. The invoice stays as written; its deposits can be invoiced again. Money already cashed is not given back by this gesture.',
    permission: 'invoices:credit',
    autonomy: 3,
    input: creditInput,
    command: creditInvoice,
    draft: { recordType: 'credit_note' },
  }),
  defineCapability({
    name: 'invoices_cash',
    description:
      'Cashes money on an invoice (cash, mobile_money, card, transfer): shared among its deposits that still owe something, never more than what is due.',
    permission: 'payments:collect',
    autonomy: 4,
    input: cashInput,
    command: cashInvoice,
    draft: { recordType: 'invoice_payment' },
  }),
  defineCapability({
    name: 'invoices_set_settings',
    description:
      'Sets what the laundry prints on its invoices, its VAT rate (0: none) and its payment delay.',
    permission: 'settings:manage',
    autonomy: 3,
    input: settingsInput,
    command: setInvoiceSettings,
    draft: { recordType: 'invoice_settings' },
  }),
];
