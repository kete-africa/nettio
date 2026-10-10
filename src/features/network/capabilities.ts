import { defineCapability } from '@kete/capabilities';
import { listSites, type Site } from '@/features/business';
import { chargesOf, monthPeriod } from '@/features/money/domain/charges';
import { asCharge, cashedIn, listExpenses } from '@/features/money/infrastructure/money.tables';
import { holds } from '@/platform/rights';
import { receiveTransfer, sendTransfer, setAllocation, setPartner, unsetPartner } from './commands';
import { nextStop, siteResults, type AllocationKey, type SiteResult } from './domain/network';
import {
  cashedBySite,
  findTransfer,
  listPartners,
  listTransfers,
  openOrdersPlaced,
  prepaidNotSpent,
  readAllocation,
  salesBySite,
  type PartnerPoint,
  type PlacedOrder,
  type Transfer,
} from './infrastructure/network.tables';
import {
  allocationInput,
  monthInput,
  noInput,
  partnerInput,
  receiveInput,
  sendInput,
  siteRef,
  transferRef,
} from './network.record';

export interface TransfersBoard {
  sites: Site[];
  /** What should move, grouped by where it is and where it goes. */
  toSend: { fromSiteId: string; toSiteId: string; orders: PlacedOrder[] }[];
  transfers: Transfer[];
  /** The deposits a slip announced and nobody found. */
  missing: PlacedOrder[];
  maySend: boolean;
  mayReceive: boolean;
}

export interface NetworkResult {
  month: string;
  allocation: AllocationKey;
  sites: SiteResult[];
  sharedCharges: number;
  /** Credit paid ahead that no deposit took yet: money of the month that belongs to no site. */
  prepaid: number;
  /** The laundry's own figures, which the lines above add up to. */
  total: { cashed: number; charges: number; result: number };
  partners: PartnerPoint[];
}

const thisMonth = (): string => new Date().toISOString().slice(0, 7);

/**
 * What a screen, a copilot or an agent may do in a laundry with several sites. Reading is level
 * 1. A transfer moves customers' clothes, a commission and a spreading rule commit the laundry:
 * an agent only prepares them.
 */
export const networkCapabilities = [
  defineCapability({
    name: 'transfers_board',
    description:
      'Between the sites: the deposits that should move (to their plant while they are worked on, back to their counter once ready), the slips on the road and the latest received with what each carries, and the deposits a slip announced that nobody found.',
    permission: 'transfers:read',
    autonomy: 1,
    input: noInput,
    async run(_input, { db }): Promise<TransfersBoard> {
      const placed = await openOrdersPlaced(db);
      const groups = new Map<string, { fromSiteId: string; toSiteId: string; orders: PlacedOrder[] }>();
      for (const order of placed) {
        const toSiteId = nextStop(order);
        if (!toSiteId || order.place.where !== 'site') continue;
        const key = `${order.place.siteId}>${toSiteId}`;
        const group = groups.get(key) ?? { fromSiteId: order.place.siteId, toSiteId, orders: [] };
        group.orders.push(order);
        groups.set(key, group);
      }
      return {
        sites: await listSites(db),
        toSend: [...groups.values()],
        transfers: await listTransfers(db),
        missing: placed.filter((order) => order.place.where === 'missing'),
        maySend: holds('transfers:send'),
        mayReceive: holds('transfers:receive'),
      };
    },
  }),
  defineCapability({
    name: 'transfers_get',
    description: 'One transfer as its slip says it: from where to where, the deposits it carries, what was found on arrival.',
    permission: 'transfers:read',
    autonomy: 1,
    input: transferRef,
    run: (input, { db }) => findTransfer(db, input.transferId),
  }),
  defineCapability({
    name: 'transfers_send',
    description:
      'Sends deposits from a site to another with a numbered slip. Every deposit must be at the site it leaves from.',
    permission: 'transfers:send',
    autonomy: 3,
    input: sendInput,
    command: sendTransfer,
    draft: { recordType: 'transfer' },
  }),
  defineCapability({
    name: 'transfers_receive',
    description:
      'Receives a slip, once: the deposits found are now at this site; those not found are said missing on the slip and in their history.',
    permission: 'transfers:receive',
    autonomy: 3,
    input: receiveInput,
    command: receiveTransfer,
    draft: { recordType: 'transfer_reception' },
  }),
  defineCapability({
    name: 'sites_result',
    description:
      'What each site earns in a month (the current one by default): deposits, pieces and sales it received, what it cashed, its own charges, its part of the charges that name no site, its result — and a partner point’s commission. The lines add up to the laundry’s own result. Computed by code.',
    permission: 'money:read',
    autonomy: 1,
    classification: 'confidential',
    input: monthInput,
    async run(input, { db }): Promise<NetworkResult> {
      const month = input.month ?? thisMonth();
      const period = monthPeriod(month);
      const expenses = await listExpenses(db, period);
      const charge = (siteId: string | null) => {
        const { fixed, variable } = chargesOf(
          expenses.filter((expense) => (expense.siteId ?? null) === siteId).map(asCharge),
          period,
        );
        return fixed + variable;
      };
      const sales = await salesBySite(db, period);
      const cashed = await cashedBySite(db, period);
      const partners = await listPartners(db);
      const allocation = await readAllocation(db);
      const sharedCharges = charge(null);
      const sites = siteResults({
        sites: (await listSites(db))
          // A closed site still shows the month it worked in.
          .filter((site) => site.active || sales.has(site.siteId) || cashed.has(site.siteId) || charge(site.siteId) > 0)
          .map((site) => ({
            siteId: site.siteId,
            name: site.name,
            orders: sales.get(site.siteId)?.orders ?? 0,
            pieces: sales.get(site.siteId)?.pieces ?? 0,
            sales: sales.get(site.siteId)?.sales ?? 0,
            cashed: cashed.get(site.siteId) ?? 0,
            charges: charge(site.siteId),
          })),
        sharedCharges,
        key: allocation,
        partners: new Map(partners.map((partner) => [partner.siteId, partner.commissionPercent])),
      });
      const all = chargesOf(expenses.map(asCharge), period);
      const totalCashed = await cashedIn(db, period);
      return {
        month,
        allocation,
        sites,
        sharedCharges,
        prepaid: await prepaidNotSpent(db, period),
        total: {
          cashed: totalCashed,
          charges: all.fixed + all.variable,
          result: totalCashed - all.fixed - all.variable,
        },
        partners,
      };
    },
  }),
  defineCapability({
    name: 'sites_set_partner',
    description:
      'Says a counter is run by a partner — a shop, a hotel desk — and the commission the laundry gives it on what its point received. The laundry’s decision alone.',
    permission: 'settings:manage',
    autonomy: 3,
    input: partnerInput,
    command: setPartner,
    draft: { recordType: 'partner_point' },
  }),
  defineCapability({
    name: 'sites_unset_partner',
    description: 'A counter is no longer a partner’s: no commission is computed for it any more.',
    permission: 'settings:manage',
    autonomy: 3,
    input: siteRef,
    command: unsetPartner,
    draft: { recordType: 'partner_point_removal' },
  }),
  defineCapability({
    name: 'sites_set_allocation',
    description:
      'Chooses how the charges that name no site are spread over the sites: by what each received in sales, in pieces, or in equal parts.',
    permission: 'settings:manage',
    autonomy: 3,
    input: allocationInput,
    command: setAllocation,
    draft: { recordType: 'cost_allocation' },
  }),
];
