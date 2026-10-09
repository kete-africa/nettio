import { createKeteSignIn, type KeteIdentity, type KeteSignIn } from '@kete/auth';
import type { Actor } from '@kete/commands';
import { actingOn } from './acting';
import { env } from './env';

let signIn: KeteSignIn | undefined;

/** People sign in with their Compte Kete; this app keeps no password. */
export function getSignIn(): KeteSignIn {
  signIn ??= createKeteSignIn({
    accountUrl: env.accountUrl,
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    redirectUri: `${env.publicUrl}/auth/callback`,
    sessionSecret: env.sessionSecret,
    // The person's token stays on the server: the app asks Kete Enterprise for her grants with it.
    keepAccessToken: true,
  });
  return signIn;
}

/**
 * Whether this deployment is registered at the Compte Kete (an operator's gesture). Until it is,
 * nobody is signed in and the sign-in address says so in clear — never a bare error.
 */
export const signInIsConfigured = (): boolean =>
  Boolean(process.env.KETE_CLIENT_ID && process.env.KETE_CLIENT_SECRET);

/** Who signed this device in with her Compte Kete. */
export async function deviceOwnerOf(request: Request): Promise<KeteIdentity | null> {
  if (!signInIsConfigured()) return null;
  return getSignIn().session(request);
}

/**
 * The person acting: who signed the device in, or — on a shared device — the person of the same
 * laundry who took over with her own code (specs/025-manager).
 */
export async function personOf(request: Request): Promise<KeteIdentity | null> {
  const device = await deviceOwnerOf(request);
  if (!device) return null;
  return (await actingOn(request, device)) ?? device;
}

/**
 * The person's own token, kept on the server; never sent to the browser. Someone acting on
 * another's session has none: the device owner's token never speaks for her.
 */
export async function tokenOf(request: Request): Promise<string | null> {
  const device = await deviceOwnerOf(request);
  if (!device || (await actingOn(request, device))) return null;
  return getSignIn().accessToken(request);
}

/** The person, acting on a screen of this app. */
export function screenActor(identity: KeteIdentity): Actor {
  return { kind: 'person', id: identity.userId, channel: 'web' };
}
