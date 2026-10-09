import { expect, test } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn } from './session';

// Specs/026-accounts in a browser, at 375 px: a price agreed with a customer, credit paid ahead
// and spent at the counter, a quote, and a company invoiced for its month.

const organizationId = freshOrganization('accounts');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };
const year = new Date().getUTCFullYear();

test.describe.configure({ mode: 'serial' });

const toTheHotel = async (page: import('@playwright/test').Page) => {
  await page.goto('/clients');
  await page.getByText('Hôtel Sarakawa').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hôtel Sarakawa');
};

test('the owner sets up and receives a first deposit from a hotel', async ({ page, context }) => {
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
  await page.getByLabel('Téléphone').fill('91 00 00 01');
  await page.getByLabel('Nom', { exact: true }).fill('Hôtel Sarakawa');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Ajouter une pièce : Chemise' }).click();
  await page.locator('#panier').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A-0001');
});

test('a price is agreed with the hotel, and it pays ahead', async ({ page, context }) => {
  await signIn(context, afi);
  await toTheHotel(page);
  await expect(page.getByText('Aucun : ce client paie les prix du catalogue.')).toBeVisible();
  await page.getByRole('button', { name: 'Convenir d’un prix' }).click();
  await page.getByLabel('Service', { exact: true }).selectOption({ label: 'Lavage et repassage' });
  await page.getByLabel('Article', { exact: true }).selectOption({ label: 'Chemise' });
  await page.getByLabel('Son prix (F CFA)').fill('350');
  await page.getByRole('button', { name: 'Enregistrer ce prix' }).click();
  await expect(page.getByText('Prix enregistré', { exact: false })).toBeVisible();
  await expect(page.getByText('Catalogue : 500 F CFA')).toBeVisible();

  await page.getByRole('button', { name: 'Recharger' }).click();
  await page.getByLabel('Montant (F CFA)').fill('10000');
  await page.getByRole('button', { name: 'Mobile Money' }).click();
  await page.getByRole('button', { name: 'Enregistrer la recharge' }).click();
  await expect(page.getByText('Recharge enregistrée : 10 000 F CFA de crédit.')).toBeVisible();
  await expect(page.getByText('Recharge (Mobile Money)')).toBeVisible();
  await shot(page, '46-customer-account');
  expect(await sideways(page)).toBe(0);
});

test('at the counter her price applies, and her credit pays', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/depots/nouveau');
  await page.getByLabel('Téléphone').fill('91 00 00 01');
  await expect(page.getByText('Ce client a 1 prix à lui', { exact: false })).toBeVisible();
  await expect(page.getByText('Crédit prépayé : 10 000 F CFA.', { exact: false })).toBeVisible();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Ajouter une pièce : Chemise' }).click();
  await expect(page.locator('#panier').getByText('1 400 F CFA').first()).toBeVisible();
  await page.getByRole('button', { name: 'Encaisser' }).click();
  await page.getByLabel('Montant (F CFA)').fill('1400');
  await page.getByRole('button', { name: 'Crédit prépayé' }).click();
  await page.getByRole('button', { name: 'Enregistrer et encaisser' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A-0002');
  await expect(page.getByText('Crédit prépayé', { exact: false }).first()).toBeVisible();

  await toTheHotel(page);
  await expect(page.getByText('Dépôt A-0002 payé')).toBeVisible();
  await expect(page.getByText('8 600 F CFA').first()).toBeVisible();
});

test('a quote is written at her prices, and she accepts it', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/devis');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Devis');
  await page.getByLabel('Client', { exact: true }).selectOption({ label: 'Hôtel Sarakawa' });
  await expect(page.getByText('Ce client a 1 prix à lui', { exact: false })).toBeVisible();
  await page.getByLabel('Service', { exact: true }).selectOption({ label: 'Lavage et repassage' });
  await page.getByLabel('Article', { exact: true }).selectOption({ label: 'Chemise' });
  await page.getByLabel('Nombre de pièces').fill('10');
  await page.getByRole('button', { name: 'Ajouter au devis' }).click();
  await expect(page.getByText('3 500 F CFA').first()).toBeVisible();
  await page.getByRole('button', { name: 'Écrire le devis' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Devis D-${year}-0001`);
  await expect(page.getByText('10 × Chemise · Lavage et repassage')).toBeVisible();
  await expect(page.getByText('350 F CFA l’unité')).toBeVisible();
  await shot(page, '47-quote');
  expect(await sideways(page)).toBe(0);
  await page.getByRole('button', { name: 'Le client accepte' }).click();
  await expect(page.getByText('Devis accepté.')).toBeVisible();
  await expect(page.getByText('Accepté', { exact: true })).toBeVisible();
});

test('a company is invoiced once for its month', async ({ page, context }) => {
  await signIn(context, afi);
  await toTheHotel(page);
  await page.getByRole('button', { name: 'Modifier les conditions' }).click();
  await page.getByLabel('Raison sociale').fill('Hôtel Sarakawa SA');
  await page.getByLabel('NIF').fill('1000999');
  await page.getByLabel('Facturer une fois par mois').check();
  await page.getByRole('button', { name: 'Enregistrer les conditions' }).click();
  await expect(page.getByText('Conditions enregistrées', { exact: false })).toBeVisible();

  await page.goto('/factures');
  const run = page.getByRole('region', { name: 'Factures du mois des entreprises' });
  await expect(run.getByText('Hôtel Sarakawa')).toBeVisible();
  await expect(run.getByText('rien à facturer')).toBeVisible();
  // Last month is shown first; this month's deposits are one step further.
  await run.getByRole('button', { name: 'Mois suivant' }).click();
  await expect(run.getByText('2 dépôt(s) à facturer')).toBeVisible();
  await run.getByRole('button', { name: 'Faire les 1 facture(s)' }).click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Faire les 1 facture(s)' }).click();
  await expect(run.getByText('1 facture(s) faites, pour 3 400 F CFA.')).toBeVisible();
  await expect(page.getByText(`F-${year}-0001 · Hôtel Sarakawa SA`)).toBeVisible();
  await shot(page, '48-month-run');
  expect(await sideways(page)).toBe(0);
});
