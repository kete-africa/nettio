import { createFileRoute } from '@tanstack/react-router';
import * as m from '@/paraglide/messages.js';
import { getSignIn, signInIsConfigured } from '@/platform/session';

/** Only a path of this app: never an address elsewhere. */
function returnPath(request: Request): string {
  const returnTo = new URL(request.url).searchParams.get('returnTo') ?? '';
  return returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/aujourdhui';
}

// Sends the person to the Compte Kete to sign in, then back where she was going.
export const Route = createFileRoute('/auth/connexion')({
  server: {
    handlers: {
      GET: ({ request }) =>
        signInIsConfigured()
          ? getSignIn().start(request, { returnTo: returnPath(request) })
          : // What happened, why, what to do (docs/product/voix.md).
            new Response(m.sign_in_not_registered(), {
              status: 503,
              headers: { 'content-type': 'text/plain; charset=utf-8' },
            }),
    },
  },
});
