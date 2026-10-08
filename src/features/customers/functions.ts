import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { perform } from '@/platform/screen';
import { customerInput, type Customer } from './customer.record';

export const fetchCustomers = createServerFn({ method: 'GET' })
  .validator((input: unknown) =>
    z.object({ text: z.string().trim().max(120).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const read = await perform<Customer[]>('customers_search', { ...data, limit: 100 });
    return read.ok ? read.output : null;
  });

export const fetchCustomer = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ customerId: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const read = await perform<Customer | null>('customers_get', data);
    return read.ok ? read.output : null;
  });

/** The customer behind a phone typed at the counter: known, new, or not a phone. */
export const lookupCustomer = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ phone: z.string().trim().min(6).max(24) }).parse(input))
  .handler(({ data }) =>
    perform<{ phone: string; customer: Customer | null }>('customers_lookup', data),
  );

export const saveCustomer = createServerFn({ method: 'POST' })
  .validator((input: unknown) => customerInput.parse(input))
  .handler(({ data }) => perform<Customer>('customers_save', data));
