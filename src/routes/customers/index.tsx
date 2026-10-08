import { Button, EmptyState, PageHeader, Row, RowList, TextField } from '@kete/design';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { formatPhone } from '@/features/customers/domain/phone';
import { fetchCustomers } from '@/features/customers/functions';
import * as m from '@/paraglide/messages.js';

const search = z.object({ q: z.string().trim().max(120).optional() });

// The laundry's customers, found by name or by phone.
export const Route = createFileRoute('/_app/clients')({
  validateSearch: (input) => search.parse(input),
  loaderDeps: ({ search: { q } }) => ({ q }),
  loader: ({ deps }) => fetchCustomers({ data: deps.q ? { text: deps.q } : {} }),
  component: CustomersPage,
});

function CustomersPage() {
  const customers = Route.useLoaderData();
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const [text, setText] = useState(q ?? '');
  if (!customers) return <EmptyState title={m.error_not_allowed()} />;
  return (
    <>
      <PageHeader title={m.nav_customers()} description={m.customers_description()} />
      <form
        className="mb-4 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate({ to: '/clients', search: text.trim() ? { q: text.trim() } : {} });
        }}
      >
        <TextField
          className="flex-1"
          label={m.customers_search()}
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <Button variant="secondary" type="submit">
          {m.action_search()}
        </Button>
      </form>
      {customers.length === 0 ? (
        <EmptyState title={m.customers_empty_title()}>{m.customers_empty_body()}</EmptyState>
      ) : (
        <RowList label={m.nav_customers()}>
          {customers.map((customer) => (
            <Row
              key={customer.customerId}
              onClick={() =>
                void navigate({
                  to: '/clients/$customerId',
                  params: { customerId: customer.customerId },
                })
              }
              title={customer.name}
              meta={<span className="font-number">{formatPhone(customer.phone)}</span>}
            />
          ))}
        </RowList>
      )}
    </>
  );
}
