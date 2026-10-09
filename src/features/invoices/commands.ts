import { defineCommand } from '@kete/commands';
import { readSettings } from '@/features/business';
import { findCustomer } from '@/features/customers';
import { cashOrder } from '@/features/orders/commands';
import { personBehind } from '@/lib/actor';
import { RuleError } from '@/lib/rule-error';
import { allocate, dueOn, linesOf, numberOf, vatInside } from './domain/invoice';
import {
  findInvoice,
  insertInvoice,
  linkOrders,
  ordersOfInvoice,
  ordersToBill,
  readInvoiceSettings,
  saveInvoiceSettings,
  takeNumber,
  unlinkOrders,
} from './infrastructure/invoices.tables';
import { cashInput, creditInput, issueInput, settingsInput } from './invoice.record';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Issues an invoice for one deposit, or for several deposits of one customer. Its number follows
 * the last one — never a gap — and what it says is written once: the customer, the laundry and
 * the amounts as they are today.
 */
export const issueInvoice = defineCommand({
  name: 'issue-invoice',
  input: issueInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const orderIds = [...new Set(input.orderIds)];
    const orders = await ordersToBill(db, orderIds);
    if (orders.length !== orderIds.length) throw new RuleError('not_found');
    const [first] = orders;
    if (!first) throw new RuleError('not_found');
    if (orders.some((order) => order.customerId !== first.customerId)) {
      throw new RuleError('invoice_one_customer');
    }
    if (orders.some((order) => order.status === 'cancelled')) throw new RuleError('order_cancelled');
    if (orders.some((order) => order.invoiceId !== null)) throw new RuleError('already_invoiced');
    const business = await readSettings(db);
    if (!business) throw new RuleError('not_set_up');
    const customer = await findCustomer(db, first.customerId);
    if (!customer) throw new RuleError('not_found');
    const settings = await readInvoiceSettings(db);
    const issuedOn = today();
    const seq = await takeNumber(db, organizationId, 'invoice', Number(issuedOn.slice(0, 4)));
    const number = numberOf('invoice', Number(issuedOn.slice(0, 4)), seq);
    const total = orders.reduce((sum, order) => sum + order.total, 0);
    const { net, vat } = vatInside(total, settings.vatPercent);
    const invoiceId = await insertInvoice(
      db,
      organizationId,
      {
        kind: 'invoice',
        number,
        customerId: customer.customerId,
        customerName: customer.name,
        customerPhone: customer.phone,
        seller: {
          name: business.businessName,
          legalName: settings.legalName,
          taxId: settings.taxId,
          tradeRegister: settings.tradeRegister,
          address: settings.address,
          footer: settings.footer,
        },
        issuedOn,
        dueOn: dueOn(issuedOn, settings.paymentDays),
        vatPercent: settings.vatPercent,
        net,
        vat,
        total,
        creditsInvoiceId: null,
        reason: '',
        createdBy: personBehind(actor),
      },
      linesOf(orders),
    );
    await linkOrders(db, organizationId, invoiceId, orders.map((order) => order.orderId));
    return { invoiceId, number, total };
  },
  summarize: (_input, output) => `Invoice ${output.number} issued: ${output.total}`,
});

/**
 * Cancels an invoice with a credit note: the invoice stays as it was written, the credit note
 * carries its amounts, negative, and says why. Its deposits can be invoiced again. Money that was
 * cashed stays on the deposits: giving it back is a refund, another gesture.
 */
export const creditInvoice = defineCommand({
  name: 'credit-invoice',
  input: creditInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const invoice = await findInvoice(db, input.invoiceId);
    if (!invoice) throw new RuleError('not_found');
    if (invoice.kind !== 'invoice') throw new RuleError('credit_note_not_credited');
    if (invoice.credited) throw new RuleError('already_credited');
    const issuedOn = today();
    const seq = await takeNumber(db, organizationId, 'credit', Number(issuedOn.slice(0, 4)));
    const number = numberOf('credit', Number(issuedOn.slice(0, 4)), seq);
    const creditId = await insertInvoice(
      db,
      organizationId,
      {
        kind: 'credit',
        number,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        customerPhone: invoice.customerPhone,
        seller: invoice.seller,
        issuedOn,
        dueOn: null,
        vatPercent: invoice.vatPercent,
        net: -invoice.net,
        vat: -invoice.vat,
        total: -invoice.total,
        creditsInvoiceId: invoice.invoiceId,
        reason: input.reason,
        createdBy: personBehind(actor),
      },
      invoice.lines.map((line) => ({ ...line, amount: -line.amount })),
    );
    await unlinkOrders(db, invoice.invoiceId);
    return { invoiceId: creditId, number, credits: invoice.number };
  },
  summarize: (_input, output) => `Credit note ${output.number} cancels ${output.credits}`,
});

/**
 * Cashes money on an invoice: shared among its deposits that still owe something, the oldest
 * first, each payment under the deposits' own rules (the till for cash, never more than due).
 */
export const cashInvoice = defineCommand({
  name: 'cash-invoice',
  input: cashInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const invoice = await findInvoice(db, input.invoiceId);
    if (!invoice) throw new RuleError('not_found');
    if (invoice.kind !== 'invoice') throw new RuleError('credit_note_not_cashed');
    if (invoice.credited) throw new RuleError('already_credited');
    const orders = await ordersOfInvoice(db, invoice.invoiceId);
    const shares = allocate(
      input.amount,
      orders.map((order) => ({ orderId: order.orderId, balance: order.total - order.paid })),
    );
    for (const share of shares) {
      await cashOrder(db, organizationId, share.orderId, { amount: share.amount, method: input.method }, actor);
    }
    const paid = orders.reduce((sum, order) => sum + order.paid, 0) + input.amount;
    return { invoiceId: invoice.invoiceId, number: invoice.number, paid, due: invoice.total - paid };
  },
  summarize: (input, output) => `${input.amount} cashed on invoice ${output.number}`,
});

/** What the laundry prints on its invoices, its tax (0: none) and its payment delay. */
export const setInvoiceSettings = defineCommand({
  name: 'set-invoice-settings',
  input: settingsInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    await saveInvoiceSettings(db, organizationId, input);
    return { vatPercent: input.vatPercent };
  },
  summarize: (input) =>
    input.vatPercent > 0 ? `Invoice mentions saved, VAT ${input.vatPercent} %` : 'Invoice mentions saved, no VAT',
});
