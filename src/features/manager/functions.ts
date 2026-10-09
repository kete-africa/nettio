import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { listStaff } from '@/features/business/infrastructure/business.tables';
import { RuleError, type Outcome } from '@/lib/rule-error';
import { forgetSwitchRule } from '@/platform/acting';
import { transaction } from '@/platform/db';
import { holds } from '@/platform/rights';
import { perform, signedIn } from '@/platform/screen';
import { deviceOwnerOf } from '@/platform/session';
import type { AskedApproval, ScheduleView, UnclaimedView } from './capabilities';
import { checkCode } from './domain/manager';
import { hasCode, peopleWithCode, readRules, saveCode, type Complaint } from './infrastructure/manager.tables';
import {
  codeInput,
  complaintInput,
  decideInput,
  orderInput,
  releaseInput,
  requestInput,
  resolveComplaintInput,
  rulesInput,
  weekInput,
} from './manager.record';

export interface ManagerView {
  schedule: ScheduleView | null;
  approvals: { approvals: AskedApproval[]; mayDecide: boolean } | null;
  complaints: Complaint[] | null;
  unclaimed: UnclaimedView | null;
}

/** Everything a manager looks at, each part only for who may read it. */
export const fetchManager = createServerFn({ method: 'GET' }).handler(async (): Promise<ManagerView> => {
  const [schedule, approvals, complaints, unclaimed] = await Promise.all([
    perform<ScheduleView>('schedule_read', {}),
    perform<{ approvals: AskedApproval[]; mayDecide: boolean }>('approvals_list', {}),
    perform<{ complaints: Complaint[] }>('complaints_list', {}),
    perform<UnclaimedView>('unclaimed_list', {}),
  ]);
  return {
    schedule: schedule.ok ? schedule.output : null,
    approvals: approvals.ok ? approvals.output : null,
    complaints: complaints.ok ? complaints.output.complaints : null,
    unclaimed: unclaimed.ok ? unclaimed.output : null,
  };
});

export const saveWeek = createServerFn({ method: 'POST' })
  .validator((input: unknown) => weekInput.parse(input))
  .handler(({ data }) => perform<{ days: number }>('schedule_set_week', data));

export const askApproval = createServerFn({ method: 'POST' })
  .validator((input: unknown) => requestInput.parse(input))
  .handler(({ data }) => perform<{ approvalId: string; number: string }>('approvals_request', data));

export const decideApproval = createServerFn({ method: 'POST' })
  .validator((input: unknown) => decideInput.parse(input))
  .handler(({ data }) => perform<{ approved: boolean; number: string }>('approvals_decide', data));

export const openComplaint = createServerFn({ method: 'POST' })
  .validator((input: unknown) => complaintInput.parse(input))
  .handler(({ data }) => perform<{ complaintId: string }>('complaints_open', data));

export const closeComplaint = createServerFn({ method: 'POST' })
  .validator((input: unknown) => resolveComplaintInput.parse(input))
  .handler(({ data }) => perform<{ complaintId: string }>('complaints_close', data));

export const saveRules = createServerFn({ method: 'POST' })
  .validator((input: unknown) => rulesInput.parse(input))
  .handler(async ({ data }) => {
    const outcome = await perform<{ quickSwitch: boolean }>('unclaimed_set_rules', data);
    // A device that switched person learns at once that the laundry no longer allows it.
    forgetSwitchRule();
    return outcome;
  });

export const chargeStorage = createServerFn({ method: 'POST' })
  .validator((input: unknown) => orderInput.parse(input))
  .handler(({ data }) => perform<{ amount: number; number: string }>('unclaimed_charge', data));

export const warnCustomer = createServerFn({ method: 'POST' })
  .validator((input: unknown) => orderInput.parse(input))
  .handler(({ data }) => perform<{ number: string; messageQueued: boolean }>('unclaimed_warn', data));

export const releaseDeposit = createServerFn({ method: 'POST' })
  .validator((input: unknown) => releaseInput.parse(input))
  .handler(({ data }) => perform<{ number: string }>('unclaimed_release', data));

export interface SwitchView {
  /** Whether the laundry allows a shared device to switch person. */
  enabled: boolean;
  /** The people who set a code: those the device may switch to. */
  people: { userId: string; name: string }[];
  /** Whether the person on screen has her own code. */
  hasCode: boolean;
  /** When someone acts on another's session: who signed the device in. */
  deviceOwner: string | null;
}

/** What the « Changer de personne » dialog needs. */
export const fetchSwitch = createServerFn({ method: 'GET' }).handler(async (): Promise<SwitchView> => {
  const { identity, caller } = await signedIn();
  const device = await deviceOwnerOf(getRequest());
  return transaction(caller.organizationId, async (db) => {
    const withCode = new Set(await peopleWithCode(db));
    return {
      enabled: (await readRules(db)).quickSwitch,
      people: (await listStaff(db))
        .filter((member) => member.active && member.role && withCode.has(member.userId))
        .map((member) => ({ userId: member.userId, name: member.name })),
      hasCode: await hasCode(db, identity.userId),
      deviceOwner: device && device.userId !== identity.userId ? device.name : null,
    };
  });
});

/**
 * A person chooses her own code. It never goes through the command journal — which keeps a
 * gesture's input: only its salted hash is stored.
 */
export const setMyCode = createServerFn({ method: 'POST' })
  .validator((input: unknown) => codeInput.extend({ code: z.string().max(12) }).parse(input))
  .handler(async ({ data }): Promise<Outcome<{ set: boolean }>> => {
    const { identity, caller, as } = await signedIn();
    return as(async () => {
      if (!holds('presence:clock')) return { ok: false as const, code: 'not_allowed', facts: {} };
      try {
        checkCode(data.code);
      } catch (error) {
        if (error instanceof RuleError) return { ok: false as const, code: error.code, facts: {} };
        throw error;
      }
      await transaction(caller.organizationId, (db) => saveCode(db, caller.organizationId, identity.userId, data.code));
      return { ok: true as const, output: { set: true } };
    });
  });
