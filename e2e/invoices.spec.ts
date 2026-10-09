import { expect, test } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn } from './session';

// Specs/019-invoices in a browser, at 375 px: an invoice on demand from a deposit, cashed, then
// cancelled by a credit note; the mentions the laundry prints; a customer's account.

const organizationId = freshOrganization('invoices');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };
const year = new Date().getUTCFullYear();

test.describe.configure({ mode: 'serial' });

test('the owner sets a price, her mentions, and receives a deposit', async ({ page, context }) => {
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

  // No invoice yet; the mentions are the laundry's to write, and VAT is off until it says so.
  await page.goto('/factures');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Factures');
  await expect(page.getByText('Aucune facture ici')).toBeVisible();
  await expect(page.getByLabel('Mon pressing facture la TVA')).not.toBeChecked();
  await page.getByLabel('Raison sociale').fill('Pressing Afi SARL');
  await page.getByLabel('NIF').fill('1000123456');
  await page.getByLabel('Adresse').fill('Agoè, Lomé');
  await page.getByRole('button', { name: 'Enregistrer les mentions' }).click();
  await expect(page.getByText('vos prochaines factures porteront ces mentions', { exact: false })).toBeVisible();

  await page.goto('/depots/nouveau');
  await page.getByLabel('Téléphone').fill('90 12 34 56');
  await page.getByLabel('Nom', { exact: true }).fill('Mme Adjovi');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Ajouter une pièce : Chemise' }).click();
  await page.locator('#panier').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A-0001');
});

test('an invoice on demand, cashed, then cancelled by a credit note', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/depots');
  await page.getByText('A-0001').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A-0001');
  await page.getByRole('button', { name: 'Faire la facture' }).click();

  // The document: the laundry's mentions, the customer, the lines, what is due.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Facture F-${year}-0001`);
  await expect(page.getByText('Pressing Afi SARL')).toBeVisible();
  await expect(page.getByText('NIF 1000123456')).toBeVisible();
  await expect(page.getByText('Mme Adjovi')).toBeVisible();
  await expect(page.getByText('4 × Chemise · Lavage et repassage')).toBeVisible();
  await expect(page.getByText('TVA non applicable.')).toBeVisible();
  await expect(page.getByText('À payer')).toBeVisible();
  await shot(page, '33-invoice');
  expect(await sideways(page)).toBe(0);

  // Cashed in part: what is left is said.
  await page.getByRole('button', { name: 'Encaisser 2 000 F CFA' }).click();
  await page.getByLabel('Montant (F CFA)').fill('1500');
  await page.getByRole('button', { name: 'Mobile Money' }).click();
  await page.getByRole('button', { name: 'Enregistrer l’encaissement' }).click();
  await expect(page.getByText('Encaissé : 1 500 F CFA. Reste dû : 500 F CFA.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Encaisser 500 F CFA' })).toBeVisible();

  // The deposit's page now leads to its invoice.
  await page.goto('/depots');
  await page.getByText('A-0001').first().click();
  await page.getByRole('button', { name: `Facture F-${year}-0001` }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Facture F-${year}-0001`);

  // Never deleted: a credit note cancels it, with its reason.
  await page.getByRole('button', { name: 'Faire un avoir' }).click();
  await page.getByLabel('Raison de l’avoir').fill('Erreur de client');
  await page.getByRole('button', { name: 'Annuler la facture par un avoir' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Avoir A-${year}-0001`);
  await expect(page.getByText(`Cet avoir annule la facture F-${year}-0001.`, { exact: false })).toBeVisible();
  await expect(page.getByText('Erreur de client')).toBeVisible();
  await shot(page, '34-credit-note');

  await page.getByRole('link', { name: 'Toutes les factures' }).click();
  await expect(page.getByText(`F-${year}-0001 · Mme Adjovi`)).toBeVisible();
  await expect(page.getByText('Annulée par un avoir')).toBeVisible();
  await page.getByRole('button', { name: 'Avoirs' }).click();
  await expect(page.getByText(`A-${year}-0001 · Mme Adjovi`)).toBeVisible();
  await expect(page.getByText(`F-${year}-0001 · Mme Adjovi`)).toBeHidden();
  await shot(page, '35-invoices');
});

test('a customer’s account bills her deposits together', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/clients');
  await page.getByText('Mme Adjovi').first().click();
  await expect(page.getByRole('heading', { name: 'Compte' })).toBeVisible();
  // The deposit was freed by the credit note: it waits to be billed again, with what it still owes.
  await expect(page.getByText('Dépôts pas encore facturés')).toBeVisible();
  await expect(page.getByText('Ce client doit en tout')).toBeVisible();
  await page.getByRole('button', { name: 'Facturer 1 dépôt(s) — 2 000 F CFA' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Facture F-${year}-0002`);
  // The money cashed before stayed on the deposit: the new invoice counts it.
  await expect(page.getByRole('button', { name: 'Encaisser 500 F CFA' })).toBeVisible();
});
