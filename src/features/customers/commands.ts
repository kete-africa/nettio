import { defineCommand } from '@kete/commands';
import type { SqlExecutor } from '@kete/tenancy';
import { readSettings } from '@/features/business';
import { RuleError } from '@/lib/rule-error';
import { customerInput, type Customer } from './customer.record';
import { normalizePhone } from './domain/phone';
import {
  findCustomerByPhone,
  insertCustomer,
  updateCustomer,
} from './infrastructure/customers.table';

/** A phone as the laundry writes it: with its country's prefix. */
export async function phoneFor(db: SqlExecutor, typed: string): Promise<string> {
  const settings = await readSettings(db);
  if (!settings) throw new RuleError('not_set_up');
  return normalizePhone(typed, settings.phonePrefix);
}

/**
 * The customer behind a phone: the one the laundry knows, or a new one with this name. Used by the
 * counter when a deposit is received — the customer is never typed twice.
 */
export async function customerAt(
  db: SqlExecutor,
  organizationId: string,
  input: { phone: string; name?: string | undefined },
): Promise<Customer> {
  const phone = await phoneFor(db, input.phone);
  const known = await findCustomerByPhone(db, phone);
  if (known) return known;
  if (!input.name?.trim()) throw new RuleError('customer_name_needed');
  return insertCustomer(db, organizationId, {
    phone,
    name: input.name.trim(),
    kind: 'person',
    channel: 'whatsapp',
    consent: true,
    preferences: '',
    note: '',
  });
}

/** Adds a customer or changes her: her phone stays hers alone in the organization. */
export const saveCustomer = defineCommand({
  name: 'save-customer',
  input: customerInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    const phone = await phoneFor(db, input.phone);
    const holder = await findCustomerByPhone(db, phone);
    if (holder && holder.customerId !== input.customerId) {
      throw new RuleError('phone_taken', { name: holder.name });
    }
    const values = { ...input, phone };
    const saved = input.customerId
      ? await updateCustomer(db, { ...values, customerId: input.customerId })
      : await insertCustomer(db, organizationId, values);
    if (!saved) throw new RuleError('not_found');
    return saved;
  },
  // Never a name nor a phone in the journal's summary.
  summarize: (input) => (input.customerId ? 'A customer changed' : 'A customer added'),
  journalInput: false,
});
