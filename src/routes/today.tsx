import {
  Button,
  EmptyState,
  KpiGrid,
  KpiTile,
  PageHeader,
  PageSection,
  Row,
  RowList,
  Tag,
} from '@kete/design';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { fetchStatement } from '@/features/assistant/functions';
import { fetchCatalog } from '@/features/catalog/functions';
import { fetchToday } from '@/features/orders/functions';
import { statusTones, statusWords } from '@/features/orders/ui/words';
import { formatDay, formatMoney, formatNumber } from '@/lib/format';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// « Aujourd'hui » answers one question: where does my day stand. The day's figures, what waits,
// what is late — each one computed by code, with its unit.
export const Route = createFileRoute('/_app/aujourdhui')({
  loader: async () => ({
    catalog: await fetchCatalog(),
    today: await fetchToday(),
    // The day's statement, for whoever reads the money (specs/007-intelligence).
    statement: await fetchStatement(),
  }),
  component: TodayPage,
});

function TodayPage() {
  const { me } = Route.useRouteContext();
  const { catalog, today, statement } = Route.useLoaderData();
  const navigate = useNavigate();
  if (!me.role && me.permissions.length === 0) {
    return <EmptyState title={m.today_no_role_title()}>{m.today_no_role_body()}</EmptyState>;
  }
  const gaps = catalog?.gaps;
  const { summary, latest } = today;
  const toDo = [
    ...(gaps && gaps.servicesWithoutPrice.length > 0
      ? [
          {
            href: '/pressing/catalogue',
            title: m.today_services_without_price({ count: gaps.servicesWithoutPrice.length }),
            meta: gaps.servicesWithoutPrice.join(' · '),
          },
        ]
      : []),
    ...(gaps && gaps.packsWithoutService.length > 0
      ? [
          {
            href: '/pressing/catalogue',
            title: m.today_packs_without_service({ count: gaps.packsWithoutService.length }),
            meta: gaps.packsWithoutService.join(' · '),
          },
        ]
      : []),
    ...(summary && summary.late > 0
      ? [{ href: '/depots?etape=open', title: m.today_late({ count: summary.late }), meta: m.today_late_meta() }]
      : []),
    ...(summary && summary.dormant > 0
      ? [
          {
            href: '/depots?etape=ready',
            title: m.today_dormant({ count: summary.dormant }),
            meta: m.today_dormant_meta(),
          },
        ]
      : []),
  ];
  return (
    <>
      <PageHeader
        title={m.today_title()}
        description={formatDay(new Date())}
        actions={
          can(me, 'orders:create') ? (
            <Button onClick={() => void navigate({ to: '/depots/nouveau' })}>{m.nav_new_order()}</Button>
          ) : undefined
        }
      />
      {summary && (
        <KpiGrid label={m.today_figures()}>
          <KpiTile
            label={m.today_cashed()}
            value={formatNumber(summary.cashed)}
            hint={m.today_cashed_hint()}
          />
          <KpiTile
            label={m.today_received()}
            value={formatNumber(summary.received)}
            hint={m.today_received_hint({ pieces: formatNumber(summary.pieces) })}
          />
          <KpiTile
            label={m.today_ready()}
            value={formatNumber(summary.ready)}
            hint={m.today_ready_hint()}
            href="/depots?etape=ready"
          />
          <KpiTile
            label={m.today_outstanding()}
            value={formatNumber(summary.outstanding)}
            hint={m.today_outstanding_hint()}
          />
        </KpiGrid>
      )}
      <PageSection first={!summary} title={m.today_to_do()}>
        {toDo.length === 0 ? (
          <p className="text-fg-muted">{m.today_nothing_title()}</p>
        ) : (
          <RowList label={m.today_to_do()}>
            {toDo.map((item) => (
              <Row key={item.title} href={item.href} title={item.title} meta={item.meta} />
            ))}
          </RowList>
        )}
      </PageSection>
      {statement && (
        <PageSection title={m.statement_title()}>
          <div className="rounded-box border border-line bg-surface p-4">
            <ul className="flex flex-col gap-1.5">
              {statement.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-3 text-body-sm text-fg-muted">{m.statement_how()}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() =>
                  void navigator.clipboard.writeText(
                    [statement.business, ...statement.lines].join('\n'),
                  )
                }
              >
                {m.statement_copy()}
              </Button>
              <a
                className="inline-flex h-(--control-height) items-center rounded-control border border-line-control bg-surface-control px-(--control-padding) font-semibold text-fg hover:bg-surface-hover"
                target="_blank"
                rel="noopener noreferrer"
                href={`https://wa.me/?text=${encodeURIComponent([statement.business, ...statement.lines].join('\n'))}`}
              >
                {m.statement_share()}
              </a>
            </div>
          </div>
        </PageSection>
      )}
      {summary && (
        <PageSection title={m.today_latest()}>
          {latest.length === 0 ? (
            <EmptyState
              title={m.orders_empty_title()}
              {...(can(me, 'orders:create')
                ? {
                    action: (
                      <Button onClick={() => void navigate({ to: '/depots/nouveau' })}>
                        {m.nav_new_order()}
                      </Button>
                    ),
                  }
                : {})}
            >
              {m.orders_empty_body()}
            </EmptyState>
          ) : (
            <RowList label={m.today_latest()}>
              {latest.map((order) => (
                <Row
                  key={order.orderId}
                  onClick={() =>
                    void navigate({ to: '/depots/$orderId', params: { orderId: order.orderId } })
                  }
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
        </PageSection>
      )}
    </>
  );
}
