import { redirect } from '@tanstack/react-router';
import { fetchMe, type Me } from '@/features/business/functions';

/** Every signed-in screen: anyone else goes through the Compte Kete first, then comes back. */
export async function requirePerson(returnTo: string): Promise<{ me: Me }> {
  const me = await fetchMe();
  if (!me) {
    throw redirect({
      href: `/auth/connexion?returnTo=${encodeURIComponent(returnTo)}`,
      reloadDocument: true,
    });
  }
  return { me };
}

/** Whether the person may open what `permission` guards: her screens only show what she may. */
export const can = (me: Me, permission: string): boolean => me.permissions.includes(permission);
