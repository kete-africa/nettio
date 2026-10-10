import { createServerFn } from '@tanstack/react-start';
import { perform } from '@/platform/screen';
import type { NetworkResult, TransfersBoard } from './capabilities';
import type { Transfer } from './infrastructure/network.tables';
import {
  allocationInput,
  monthInput,
  partnerInput,
  receiveInput,
  sendInput,
  siteRef,
  transferRef,
} from './network.record';

export const fetchTransfers = createServerFn({ method: 'GET' }).handler(async () => {
  const read = await perform<TransfersBoard>('transfers_board', {});
  return read.ok ? read.output : null;
});

export const fetchTransfer = createServerFn({ method: 'GET' })
  .validator((input: unknown) => transferRef.parse(input))
  .handler(async ({ data }) => {
    const read = await perform<Transfer | null>('transfers_get', data);
    return read.ok ? read.output : null;
  });

export const sendTransfer = createServerFn({ method: 'POST' })
  .validator((input: unknown) => sendInput.parse(input))
  .handler(({ data }) =>
    perform<{ transferId: string; number: string; to: string; deposits: number }>('transfers_send', data),
  );

export const receiveTransfer = createServerFn({ method: 'POST' })
  .validator((input: unknown) => receiveInput.parse(input))
  .handler(({ data }) => perform<{ number: string; received: number; missing: number }>('transfers_receive', data));

export const fetchSitesResult = createServerFn({ method: 'GET' })
  .validator((input: unknown) => monthInput.parse(input))
  .handler(async ({ data }) => {
    const read = await perform<NetworkResult>('sites_result', data);
    return read.ok ? read.output : null;
  });

export const savePartner = createServerFn({ method: 'POST' })
  .validator((input: unknown) => partnerInput.parse(input))
  .handler(({ data }) => perform<{ partnerName: string }>('sites_set_partner', data));

export const removePartner = createServerFn({ method: 'POST' })
  .validator((input: unknown) => siteRef.parse(input))
  .handler(({ data }) => perform<{ siteId: string }>('sites_unset_partner', data));

export const saveAllocation = createServerFn({ method: 'POST' })
  .validator((input: unknown) => allocationInput.parse(input))
  .handler(({ data }) => perform<{ allocation: string }>('sites_set_allocation', data));
