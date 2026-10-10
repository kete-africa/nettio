import { Icon, Row, RowList, Tag } from '@kete/design';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import { fetchOrders } from '../functions';
import type { OrderSummary } from '../order.record';
import { statusTones, statusWords } from './words';

/**
 * The counter's one search (specs/021-counter-home): a phone, a deposit's number or a name — and
 * the deposits that match, the ready ones first, each one touch from its page.
 */
export function CounterSearch() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [found, setFound] = useState<OrderSummary[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const asked = text.trim();
    if (asked.length < 2) {
      setFound(null);
      return;
    }
    let alive = true;
    setSearching(true);
    // Once the typing pauses: a counter's connection is slow.
    const timer = setTimeout(() => {
      void fetchOrders({ data: { stage: 'all', text: asked } })
        .then((orders) => {
          if (!alive) return;
          const rank = (order: OrderSummary) => (order.status === 'ready' ? 0 : order.status === 'collected' || order.status === 'cancelled' ? 2 : 1);
          setFound([...(orders ?? [])].sort((a, b) => rank(a) - rank(b)).slice(0, 8));
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [text]);

  return (
    <div className="mb-6">
      <label className="flex items-center gap-3 rounded-control border border-line-strong bg-surface-control px-3.5 py-1 text-fg focus-within:border-accent">
        <Icon name="search" />
        <span className="sr-only">{m.search_label()}</span>
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder={m.search_placeholder()}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            const asked = text.trim();
            if (asked.length < 2) return;
            // A label's bar code is the deposit's number: read by a scanner, it opens at once.
            void fetchOrders({ data: { stage: 'all', text: asked } }).then((orders) => {
              const exact = (orders ?? []).filter((order) => order.number.toUpperCase() === asked.toUpperCase());
              const [only] = exact.length === 1 ? exact : (orders ?? []).length === 1 ? (orders ?? []) : [];
              if (only) void navigate({ to: '/depots/$orderId', params: { orderId: only.orderId } });
            });
          }}
          className="h-11 w-full border-0 bg-transparent text-body text-fg outline-0 placeholder:text-fg-muted"
        />
      </label>
      <div className="mt-2" aria-live="polite">
        {text.trim().length >= 2 && found === null && searching && (
          <p className="text-body-sm text-fg-muted">{m.search_searching()}</p>
        )}
        {found !== null && found.length === 0 && (
          <p className="text-body-sm text-fg-muted">{m.search_nothing({ text: text.trim() })}</p>
        )}
        {found !== null && found.length > 0 && (
          <RowList label={m.search_results()}>
            {found.map((order) => (
              <Row
                key={order.orderId}
                onClick={() => void navigate({ to: '/depots/$orderId', params: { orderId: order.orderId } })}
                title={`${order.number} · ${order.customerName}`}
                meta={<Tag tone={statusTones[order.status]}>{statusWords[order.status]()}</Tag>}
                end={
                  <span className="text-right font-number">
                    <span className="block">{formatMoney(order.total)}</span>
                    <span className="block text-body-sm text-fg-muted">
                      {order.total - order.paid > 0
                        ? m.order_balance_of({ amount: formatMoney(order.total - order.paid) })
                        : m.order_paid_in_full()}
                    </span>
                  </span>
                }
              />
            ))}
          </RowList>
        )}
      </div>
    </div>
  );
}
