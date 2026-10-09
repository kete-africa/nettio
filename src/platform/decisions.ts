import type { SqlExecutor } from '@kete/tenancy';
import { addressesOf, peopleOfAddress } from '@/features/assistant';
import { permissionsOfRole, readRolePermissions } from '@/features/business';
import { listStaff } from '@/features/business/infrastructure/business.tables';
import {
  decidedByMessage,
  tellDeciders,
  type DecisionChannel,
  type DecisionWords,
} from '@/features/manager/by-messaging';
import { errorSentence } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { RuleError } from '@/lib/rule-error';
import * as m from '@/paraglide/messages.js';
import { getChannels } from './channels';
import { getPool, transaction } from './db';
import { businessPermissionList } from './permissions';
import { registry } from './registry';
import { asStaff } from './rights';

// A manager's approvals by message (specs/025-manager), wired to this deployment: who decides is
// read from the laundry's own roles, the channels are the connected ones — never simulated.

const fr = { locale: 'fr' } as const;

const words: DecisionWords = {
  asked: (facts) =>
    m.decision_asked(
      {
        by: facts.by || m.approval_someone({}, fr),
        what:
          facts.kind === 'cancel'
            ? m.approval_kind_cancel({}, fr)
            : `${facts.kind === 'refund' ? m.approval_kind_refund({}, fr) : m.approval_kind_discount({}, fr)} ${formatMoney(facts.amount)}`,
        number: facts.number,
        customer: facts.customer,
        reason: facts.reason,
        code: facts.code,
      },
      fr,
    ),
  granted: (number) => m.approval_granted({ number }, fr),
  refused: (number) => m.approval_refused({ number }, fr),
  unknown: (code) => m.decision_unknown({ code }, fr),
  notAllowed: () => m.error_not_allowed({}, fr),
  stopped: (code) => errorSentence(code),
};

async function send(channel: DecisionChannel, to: string, text: string): Promise<boolean> {
  const sender = getChannels()[channel];
  if (!sender) return false;
  try {
    await sender.sendText(to, text);
    return true;
  } catch {
    // A provider that refuses — outside its window, unreachable — does not stop the others.
    return false;
  }
}

/** Tells those who decide, in this laundry, about the requests that wait. */
export function tellDecidersOf(db: SqlExecutor): Promise<number> {
  return tellDeciders(db, {
    deciders: async (inside) => {
      const decided = await readRolePermissions(inside);
      return (await listStaff(inside))
        .filter(
          (member) =>
            member.active &&
            member.role &&
            permissionsOfRole(member.role, businessPermissionList, decided).has('approvals:decide'),
        )
        .map((member) => ({ userId: member.userId, name: member.name }));
    },
    names: async (inside) => new Map((await listStaff(inside)).map((member) => [member.userId, member.name])),
    addresses: addressesOf,
    send,
    words,
  });
}

/** A message that may be a manager's « OUI 12 »: decided with her rights, journaled in her name. */
export function decisionHeard(input: { channel: DecisionChannel; sender: string; text: string }): Promise<boolean> {
  return decidedByMessage(input, {
    people: (channel, sender) => peopleOfAddress(getPool(), channel, sender),
    inOrganization: transaction,
    asStaff,
    decide: async (person, channel, decision) => {
      try {
        const result = await registry.invoke({
          actor: { kind: 'person', id: person.userId, channel },
          organizationId: person.organizationId,
          name: 'approvals_decide',
          input: decision,
          // Her message names the request and says yes or no: it is the confirmation.
          confirmed: true,
        });
        if (result.status === 'done') return { ok: true };
        return { ok: false, code: result.status === 'refused' ? result.reason : 'not_possible' };
      } catch (error) {
        if (error instanceof RuleError) return { ok: false, code: error.code };
        throw error;
      }
    },
    reply: async (text) => {
      await send(input.channel, input.sender, text);
    },
    words,
  });
}
