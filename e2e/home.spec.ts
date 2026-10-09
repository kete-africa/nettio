import { expect, test } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn, throughTheWorkshop } from './session';

// Specs/021-counter-home in a browser, at 375 px: the counter in two gestures — one search by
// phone, number or name, then the deposit handed over and cashed in one gesture.

const organizationId = freshOrganization('home');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };

test.describe.configure({ mode: 'serial' });

test('a deposit is received and made ready', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/demarrage');
  await page.getByLabel('Nom du pressing').fill('Pressing Afi');
  await page.getByLabel('Nom du point').fill('Agoè');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page).toHaveURL(/\/pressing\/schema$/);
  await page.goto('/pressing/catalogue');
  await page.getByRole('button', { name: 'Prix' }).click();
  const price = page.getByLabel('Chemise', { exact: true });
  await price.fill('500');
  await price.blur();
  await expect(page.getByText('500 F CFA', { exact: true }).first()).toBeVisible();
  await page.goto('/depots/nouveau');
  await page.getByLabel('Téléphone').fill('90 12 34 56');
  await page.getByLabel('Nom', { exact: true }).fill('Mme Adjovi');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Ajouter une pièce : Chemise' }).click();
  await page.locator('#panier').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A-0001');
  await throughTheWorkshop(page, 'A-0001');
});

test('the counter in two gestures: found by its phone, handed over and cashed', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/aujourdhui');
  // What is ready waits on the day's first screen.
  const waiting = page.getByRole('region', { name: 'À remettre' });
  await expect(waiting.getByText('A-0001 · Mme Adjovi')).toBeVisible();

  // One search: a name that is not there, a number, a phone.
  const search = page.getByPlaceholder('Téléphone, n° de dépôt ou nom');
  await search.fill('Kossi');
  await expect(page.getByText('Aucun dépôt pour « Kossi ».')).toBeVisible();
  await search.fill('A-0001');
  const found = page.getByRole('list', { name: 'Dépôts trouvés' });
  await expect(found.getByText('A-0001 · Mme Adjovi')).toBeVisible();
  await search.fill('90 12');
  await expect(found.getByText('A-0001 · Mme Adjovi')).toBeVisible();
  await shot(page, '41-counter-search');
  expect(await sideways(page)).toBe(0);

  // First gesture: the deposit. Second: handed over and cashed, with its amount on the button.
  await found.getByText('A-0001 · Mme Adjovi').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A-0001');
  await page.getByRole('button', { name: 'Remettre et encaisser 2 000 F CFA' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByLabel('Montant (F CFA)')).toHaveValue('2000');
  await drawer.getByRole('button', { name: 'Mobile Money' }).click();
  await drawer.getByRole('button', { name: 'Remettre' }).click();
  await expect(page.getByText('Retiré', { exact: true }).first()).toBeVisible();

  await page.goto('/aujourdhui');
  await expect(page.getByText('Aucun dépôt prêt n’attend son client.')).toBeVisible();
});
