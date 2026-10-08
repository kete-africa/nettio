import { createKeteSignIn, type KeteIdentity, type KeteSignIn } from '@kete/auth';
import type { Actor } from '@kete/commands';
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

export async function personOf(request: Request): Promise<KeteIdentity | null> {
  if (!signInIsConfigured()) return null;
  return getSignIn().session(request);
}

/** The person's own token, kept on the server; never sent to the browser. */
export async function tokenOf(request: Request): Promise<string | null> {
  if (!signInIsConfigured()) return null;
  return getSignIn().accessToken(request);
}

/** The person, acting on a screen of this app. */
export function screenActor(identity: KeteIdentity): Actor {
  return { kind: 'person', id: identity.userId, channel: 'web' };
}
