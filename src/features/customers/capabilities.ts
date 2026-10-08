import { defineCapability } from '@kete/capabilities';
import { z } from 'zod';
import { phoneFor, saveCustomer } from './commands';
import { customerInput } from './customer.record';
import {
  findCustomer,
  findCustomerByPhone,
  searchCustomers,
} from './infrastructure/customers.table';

/**
 * What a screen, a copilot or an agent may do with customers. Their names and phones are personal
 * data: confidential, never in an event, and an agent only prepares a change.
 */
export const customerCapabilities = [
  defineCapability({
    name: 'customers_search',
    description:
      'The customers of the laundry whose name or phone contains a text (or the latest ones): name, phone, preferred channel, preferences.',
    permission: 'customers:read',
    autonomy: 1,
    classification: 'confidential',
    input: z.object({
      text: z.string().trim().max(120).optional(),
      limit: z.number().int().min(1).max(100).default(30),
    }),
    run: (input, { db }) => searchCustomers(db, input),
  }),
  defineCapability({
    name: 'customers_lookup',
    description:
      'The customer behind a phone number as typed at the counter, or null when the laundry does not know it yet; the phone comes back as Nettio writes it.',
    permission: 'customers:read',
    autonomy: 1,
    classification: 'confidential',
    input: z.object({ phone: z.string().trim().min(6).max(24) }),
    async run(input, { db }) {
      const phone = await phoneFor(db, input.phone);
      return { phone, customer: await findCustomerByPhone(db, phone) };
    },
  }),
  defineCapability({
    name: 'customers_get',
    description: 'One customer of the laundry, by identifier.',
    permission: 'customers:read',
    autonomy: 1,
    classification: 'confidential',
    input: z.object({ customerId: z.string().min(1).max(64) }),
    run: (input, { db }) => findCustomer(db, input.customerId),
  }),
  defineCapability({
    name: 'customers_save',
    description:
      'Adds a customer or changes her: phone (her identifier), name, preferred channel (whatsapp, telegram, sms, none), consent to messages, preferences.',
    permission: 'customers:write',
    autonomy: 3,
    classification: 'confidential',
    input: customerInput,
    command: saveCustomer,
    draft: { recordType: 'customer' },
  }),
];
