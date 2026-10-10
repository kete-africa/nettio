import { expect, test } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn, throughTheWorkshop } from './session';

// Specs/027-delivery in a browser, at 375 px: a zone and its fee, a delivery planned from the
// deposit, the courier's round, the hand-over with its proof and its money, the slip.

const organizationId = freshOrganization('delivery');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };

test.describe.configure({ mode: 'serial' });

test('a ready deposit, a zone and its fee', async ({ page, context }) => {
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

  await page.goto('/livraisons');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Collectes et livraisons');
  await expect(page.getByText('Rien à collecter ni à livrer pour vous.')).toBeVisible();
  await expect(page.getByText('Aucune zone.')).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter une zone' }).click();
  await page.getByLabel('Nom de la zone').fill('Agoè');
  await page.getByLabel('Frais de livraison (F CFA)').fill('500');
  await page.getByRole('button', { name: 'Enregistrer la zone' }).click();
  await expect(page.getByText('Zone « Agoè » enregistrée.')).toBeVisible();
  expect(await sideways(page)).toBe(0);
});

test('a delivery is planned from the deposit; its fee joins the price', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/depots?etape=ready');
  await page.getByText('A-0001 · Mme Adjovi').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A-0001');
  await page.getByRole('button', { name: 'Livrer ce dépôt' }).click();
  await expect(page.getByLabel('Zone')).toContainText('Agoè — 500 F CFA');
  await page.getByLabel('Adresse et repère').fill('Agoè, derrière le marché');
  await page.getByRole('button', { name: 'Prévoir', exact: true }).click();
  await expect(page.getByText('C’est prévu. 500 F CFA de frais de livraison ajoutés au dépôt.')).toBeVisible();
  await expect(page.getByText('Frais de livraison').first()).toBeVisible();
  await expect(page.getByText('2 500 F CFA').first()).toBeVisible();
});

test('the courier leaves, hands over, cashes — and the slip keeps the proof', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/livraisons');
  const round = page.getByRole('region', { name: 'Ma tournée' });
  await expect(round.getByText('Livraison · A-0001 · Mme Adjovi')).toBeVisible();
  await expect(round.getByText('à encaisser : 2 500 F CFA', { exact: false })).toBeVisible();
  await shot(page, '49-round');
  expect(await sideways(page)).toBe(0);
  await round.getByRole('button', { name: 'Je pars' }).click();
  await expect(page.getByText('En route. Le client est prévenu', { exact: false })).toBeVisible();
  await round.getByRole('button', { name: 'Remis', exact: true }).click();
  await round.getByLabel('Reçu par').fill('Mme Adjovi');
  await expect(round.getByLabel('Montant (F CFA)')).toHaveValue('2500');
  await round.getByRole('button', { name: 'Mobile Money' }).click();
  await round.getByRole('button', { name: 'Remis', exact: true }).click();
  await expect(page.getByText('Dépôt A-0001 remis à Mme Adjovi.')).toBeVisible();
  await expect(page.getByText('Rien à collecter ni à livrer pour vous.')).toBeVisible();

  await page.getByRole('link', { name: 'Livraison · A-0001 · Mme Adjovi' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bon de livraison A-0001');
  await expect(page.getByText('Agoè · Agoè, derrière le marché')).toBeVisible();
  await expect(page.getByText('Encaissé')).toBeVisible();
  await shot(page, '50-slip');
  expect(await sideways(page)).toBe(0);
});
