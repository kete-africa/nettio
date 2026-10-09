import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { findStaffOf } from '@/features/business';
import { LOCK_MINUTES, MAX_FAILURES } from '@/features/manager/domain/manager';
import { readRules, verifyCode } from '@/features/manager/infrastructure/manager.tables';
import { actingCookie, signActing } from '@/platform/acting';
import { transaction } from '@/platform/db';
import { deviceOwnerOf } from '@/platform/session';

const asked = z.union([
  z.object({ userId: z.string().min(1).max(64), code: z.string().regex(/^\d{6}$/) }),
  z.object({ back: z.literal(true) }),
]);

const answer = (body: { ok: true } | { ok: false; code: string }, cookie?: string): Response =>
  new Response(JSON.stringify(body), {
    status: body.ok ? 200 : 403,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...(cookie ? { 'set-cookie': cookie } : {}),
    },
  });

/**
 * Who acts on this device (specs/025-manager). A person of the laundry takes over with her own
 * code — when the laundry allows it — or hands the device back to who signed it in. A wrong code
 * counts: after a few, the code is locked for a while.
 */
async function switchPerson(request: Request): Promise<Response> {
  const device = await deviceOwnerOf(request);
  if (!device?.organizationId) return new Response(null, { status: 401 });
  const organizationId = device.organizationId;
  const parsed = asked.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return answer({ ok: false, code: 'invalid_input' });
  if ('back' in parsed.data) return answer({ ok: true }, actingCookie(null));
  const { userId, code } = parsed.data;
  const outcome = await transaction(organizationId, async (db) => {
    if (!(await readRules(db)).quickSwitch) return { code: 'quick_switch_off' as const };
    const staff = await findStaffOf(db, userId);
    if (!staff?.active || !staff.role) return { code: 'not_found' as const };
    const verdict = await verifyCode(db, userId, code, { maxFailures: MAX_FAILURES, lockMinutes: LOCK_MINUTES });
    if (verdict === 'ok') return { name: staff.name };
    return { code: verdict === 'locked' ? ('code_locked' as const) : ('code_wrong' as const) };
  });
  if ('code' in outcome) return answer({ ok: false, code: outcome.code });
  // Her own session's owner takes the device back by ending the switch, not by her code.
  if (userId === device.userId) return answer({ ok: true }, actingCookie(null));
  const token = await signActing({ organizationId, userId, name: outcome.name, deviceUserId: device.userId });
  return answer({ ok: true }, actingCookie(token));
}

export const Route = createFileRoute('/auth/personne')({
  server: { handlers: { POST: ({ request }) => switchPerson(request) } },
});
