import { expect, test } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn, throughTheWorkshop } from './session';

// Specs/005-workshop in a browser, at 375 px: a deposit waits step by step, one touch validates a
// step, an incident sends it back, and it is ready when — and only when — its route is done.

const organizationId = freshOrganization('workshop');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };

test.describe.configure({ mode: 'serial' });

test('a deposit received at the counter waits in the workshop', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/demarrage');
  await page.getByLabel('Nom du pressing').fill('Pressing Afi');
  await page.getByLabel('Seul', { exact: false }).first().check();
  await page.getByLabel('Nom du point').fill('Agoè');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page).toHaveURL(/\/pressing\/schema$/);

  await page.goto('/atelier');
  await expect(page.getByText('Rien n’attend à l’atelier')).toBeVisible();

  await page.goto('/pressing/catalogue');
  await page.getByRole('button', { name: 'Prix' }).click();
  const shirt = page.getByLabel('Chemise', { exact: true });
  await shirt.fill('500');
  await shirt.blur();
  await expect(page.getByText('500 F CFA', { exact: true })).toBeVisible();

  await page.goto('/depots/nouveau');
  await page.getByLabel('Téléphone').fill('90 12 34 56');
  await page.getByLabel('Nom', { exact: true }).fill('Mme Adjovi');
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Ajouter une pièce : Chemise' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A-0001');
  // Work is left: the deposit is not marked ready by hand.
  await expect(page.getByRole('button', { name: 'Marquer prêt' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Atelier' })).toBeVisible();

  await page.goto('/atelier');
  await expect(page.getByRole('button', { name: 'Tri · 1' })).toBeVisible();
  await expect(page.getByText('Lavage et repassage', { exact: true })).toBeVisible();
  await shot(page, '22-workshop');
  expect(await sideways(page)).toBe(0);
});

test('one touch validates a step; an incident sends the bag back', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/atelier');
  await page.getByRole('button', { name: 'Valider : Tri' }).click();
  await expect(page.getByText('A-0001 : Tri fait. Il attend maintenant à « Lavage ».')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Valider : Lavage' })).toBeVisible();

  await page.getByRole('button', { name: 'Signaler un incident' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Ce qui s’est passé').selectOption('stain_left');
  await drawer.getByLabel('Note').fill('tache au col');
  await drawer.getByLabel('Renvoyer à une étape').selectOption({ label: 'Tri' });
  await drawer.getByRole('button', { name: 'Signaler un incident' }).click();
  await expect(page.getByText('Reprise 1')).toBeVisible();
  await expect(page.getByText('A-0001 · Tache restante')).toBeVisible();
  await shot(page, '23-workshop-incident');

  await page.getByText('A-0001 · Tache restante').click();
  const resolve = page.getByRole('dialog');
  await resolve.getByLabel('Ce qui a été fait').fill('détaché à la main');
  await resolve.getByRole('button', { name: 'Clore l’incident' }).click();
  await expect(page.getByText('A-0001 · Tache restante')).toHaveCount(0);
});

test('the deposit is ready when its last step is validated', async ({ page, context }) => {
  await signIn(context, afi);
  await throughTheWorkshop(page, 'A-0001');
  await page.goto('/depots?etape=ready');
  await page.getByText('A-0001 · Mme Adjovi').click();
  await expect(page.getByText('Terminé', { exact: true })).toBeVisible();
  await expect(page.getByText('Tache restante')).toBeVisible();
  await page.getByRole('button', { name: 'Emplacement' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Emplacement').fill('Portant B');
  await drawer.getByRole('button', { name: 'Emplacement' }).click();
  await expect(page.getByText('Portant B').first()).toBeVisible();
  await shot(page, '24-order-work');
  expect(await sideways(page)).toBe(0);
});
