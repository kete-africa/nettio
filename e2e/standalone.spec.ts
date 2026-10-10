import { expect, test } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn } from './session';

// Specs/030-standalone in a browser, at 375 px: the front door and the legal pages read without
// signing in; help by role; the laundry's data exported by its owner, and by nobody else.

const organizationId = freshOrganization('standalone');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };
const mawuli = { userId: `usr_mawuli_${organizationId}`, name: 'Mawuli', organizationId, role: 'member' as const };

test.describe.configure({ mode: 'serial' });

test('anyone reads what Nettio is, and what it never does, before coming in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Savoir si votre pressing gagne vraiment de l’argent');
  await expect(page.getByRole('link', { name: 'Commencer' })).toHaveAttribute('href', '/auth/connexion?returnTo=%2Fdemarrage');
  await expect(page.getByText('Il ne fixe aucun prix à votre place.', { exact: false })).toBeVisible();
  await shot(page, '55-landing');
  expect(await sideways(page)).toBe(0);

  await page.getByRole('link', { name: 'Confidentialité' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Confidentialité');
  await expect(page.getByRole('heading', { name: 'Intelligence artificielle' })).toBeVisible();
  await page.getByRole('link', { name: 'Conditions d’utilisation' }).click();
  await expect(page.getByRole('heading', { name: 'Vos données sont à vous' })).toBeVisible();
  await page.getByRole('link', { name: 'Mentions légales' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mentions légales');
  // Who publishes is said by the deployment — and, until it is, the page says so plainly.
  await expect(page.getByText('À compléter par l’éditeur avant l’ouverture au public.').first()).toBeVisible();
  expect(await sideways(page)).toBe(0);
});

test('signed in, the front door leads to the day; help comes by role', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/');
  await expect(page).toHaveURL(/\/demarrage$/);
  await page.getByLabel('Nom du pressing').fill('Pressing Afi');
  await page.getByLabel('Nom du point').fill('Agoè');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page).toHaveURL(/\/pressing\/schema$/);

  await page.goto('/aide');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aide et données');
  await expect(page.getByRole('heading', { name: 'Votre rôle : Patron' })).toBeVisible();
  await expect(page.getByText('Commencez par vos prix', { exact: false })).toBeVisible();
  await page.getByText('Livraison', { exact: true }).click();
  await expect(page.getByText('« Je pars », puis « Remis »', { exact: false })).toBeVisible();
  await expect(page.getByText('Votre Compte Kete n’indique pas d’abonnement Nettio', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Exporter toutes mes données' })).toHaveAttribute('href', '/api/export');
  await shot(page, '56-help');
  expect(await sideways(page)).toBe(0);
});

test('the owner downloads her data; someone else of the laundry cannot', async ({ page, context }) => {
  await signIn(context, afi);
  const mine = await page.request.get('/api/export');
  expect(mine.status()).toBe(200);
  expect(mine.headers()['content-disposition']).toContain('attachment; filename="nettio-');
  const data = (await mine.json()) as { organizationId: string; tables: Record<string, Record<string, unknown>[]>; missing: string[] };
  expect(data.organizationId).toBe(organizationId);
  expect(data.missing).toEqual([]);
  expect(data.tables.settings?.[0]).toMatchObject({ business_name: 'Pressing Afi' });
  expect(data.tables.staff_codes).toBeUndefined();

  await signIn(context, mawuli);
  expect((await page.request.get('/api/export')).status()).toBe(403);
  await context.clearCookies();
  expect((await page.request.get('/api/export', { maxRedirects: 0 })).status()).toBe(401);
});
