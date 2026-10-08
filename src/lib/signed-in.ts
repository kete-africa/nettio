import { redirect } from '@tanstack/react-router';
import { fetchPerson } from '@/features/tasks/functions';

/** Every signed-in screen: anyone else goes through the Compte Kete first, then comes back. */
export async function requirePerson(returnTo: string) {
  const person = await fetchPerson();
  if (!person) {
    throw redirect({
      href: `/auth/connexion?returnTo=${encodeURIComponent(returnTo)}`,
      reloadDocument: true,
    });
  }
  return { person };
}
