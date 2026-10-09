import type { KeteIdentity } from '@kete/auth';
import { jwtVerify, SignJWT } from 'jose';
// Read at its file, not at the feature's door: the door needs the session, which needs this.
import { readRules } from '@/features/manager/infrastructure/manager.tables';
import { transaction } from './db';
import { env } from './env';

// A shared device (specs/025-manager): one person signed it in with her Compte Kete; another of
// the same laundry takes over with her personal code. Who acts is kept in a second, signed
// cookie — valid only on top of the device's own session, in the same organization, and while
// the laundry allows it. The person acting holds the rights of her business role, never more.

export const ACTING_COOKIE = 'nettio_acting';
const HOURS = 12;
const key = () => new TextEncoder().encode(env.sessionSecret);

export async function signActing(acting: {
  organizationId: string;
  userId: string;
  name: string;
  /** The person whose session the device runs on. */
  deviceUserId: string;
}): Promise<string> {
  return new SignJWT({ org: acting.organizationId, name: acting.name, by: acting.deviceUserId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(acting.userId)
    .setAudience('nettio-acting')
    .setIssuedAt()
    .setExpirationTime(`${HOURS}h`)
    .sign(key());
}

/** The cookie that makes a person act on the device, or that ends it (`value` null). */
export function actingCookie(value: string | null): string {
  const secure = env.publicUrl.startsWith('https://') ? '; Secure' : '';
  return value === null
    ? `${ACTING_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
    : `${ACTING_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${HOURS * 3600}${secure}`;
}

const cookieOf = (request: Request, name: string): string | null => {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [key = '', ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
};

// Whether a laundry allows the switch, remembered for a short while: asked on every request.
const allowed = new Map<string, { until: number; value: boolean }>();
async function switchAllowed(organizationId: string): Promise<boolean> {
  const known = allowed.get(organizationId);
  if (known && known.until > Date.now()) return known.value;
  const value = (await transaction(organizationId, (db) => readRules(db))).quickSwitch;
  if (allowed.size > 2000) allowed.clear();
  allowed.set(organizationId, { until: Date.now() + 30_000, value });
  return value;
}

/** Tests, and the gesture that changes the rule: forget what was remembered. */
export function forgetSwitchRule(organizationId?: string): void {
  if (organizationId) allowed.delete(organizationId);
  else allowed.clear();
}

/**
 * The person acting on a device signed in by `device`, if any: her cookie is hers only on that
 * device's session, in its organization, and while the laundry allows the switch.
 */
export async function actingOn(request: Request, device: KeteIdentity): Promise<KeteIdentity | null> {
  const token = cookieOf(request, ACTING_COOKIE);
  if (!token || !device.organizationId) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { audience: 'nettio-acting' });
    if (payload.org !== device.organizationId || payload.by !== device.userId || !payload.sub) return null;
    if (payload.sub === device.userId) return null;
    if (!(await switchAllowed(device.organizationId))) return null;
    return {
      userId: payload.sub,
      email: '',
      name: typeof payload.name === 'string' ? payload.name : payload.sub,
      organizationId: device.organizationId,
      // Never the Compte Kete's role of the device's owner: her own business role decides.
      role: 'member',
      apps: {},
      twoFactor: false,
      expiresAt: device.expiresAt,
    };
  } catch {
    return null;
  }
}
