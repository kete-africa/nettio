import { expect, test } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn } from './session';

// Specs/029-stock in a browser, at 375 px: a consumable and its threshold, an order received, a
// withdrawal that brings it under its threshold, the day that says so, a supplier paid.

const organizationId = freshOrganization('stock');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };

test.describe.configure({ mode: 'serial' });

test('a consumable, a supplier, an order and its reception', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/demarrage');
  await page.getByLabel('Nom du pressing').fill('Pressing Afi');
  await page.getByLabel('Nom du point').fill('Agoè');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page).toHaveURL(/\/pressing\/schema$/);

  await page.goto('/pressing/stock');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Stock et achats');
  await expect(page.getByText('Aucun consommable.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter un consommable' }).click();
  await page.getByLabel('Nom du consommable').fill('Lessive');
  await page.getByLabel('Unité').fill('L');
  await page.getByLabel('Seuil d’alerte').fill('10');
  await page.getByRole('button', { name: 'Enregistrer le consommable' }).click();
  await expect(page.getByText('« Lessive » enregistré.')).toBeVisible();
  await expect(page.getByText('Rupture', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Ajouter un fournisseur' }).click();
  await page.getByLabel('Nom du fournisseur').fill('Togo Détergents');
  await page.getByRole('button', { name: 'Enregistrer le fournisseur' }).click();
  await expect(page.getByText('Fournisseur « Togo Détergents » enregistré.')).toBeVisible();

  await page.getByRole('button', { name: 'Nouvelle commande' }).click();
  await page.getByLabel('Quantité', { exact: true }).fill('40');
  await page.getByLabel('Coût de l’unité (F CFA)').fill('1500');
  await page.getByRole('button', { name: 'Ajouter à la commande' }).click();
  await expect(page.getByText('60 000 F CFA').first()).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer la commande' }).click();
  await expect(page.getByText('Commande enregistrée.', { exact: false })).toBeVisible();
  await expect(page.getByText('BC-0001 · Togo Détergents')).toBeVisible();

  await page.getByRole('button', { name: 'Réceptionner' }).click();
  await expect(page.getByLabel('Lessive arrivé (L)')).toHaveValue('40');
  await page.getByRole('button', { name: 'Réceptionner' }).click();
  await expect(page.getByText('BC-0001 reçu', { exact: false })).toBeVisible();
  await expect(page.getByText('40 L', { exact: true })).toBeVisible();
  await expect(page.getByText('dû : 60 000 F CFA')).toBeVisible();
  await shot(page, '54-stock');
  expect(await sideways(page)).toBe(0);
});

test('a withdrawal under the threshold is said on the day; the supplier is paid', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/pressing/stock');
  await page.getByRole('button', { name: 'Sortir : Lessive' }).click();
  await page.getByLabel('Quantité sortie de Lessive (L)').fill('32');
  await page.getByRole('button', { name: 'Enregistrer la sortie' }).click();
  await expect(page.getByText('32 L de Lessive sortis.')).toBeVisible();
  await expect(page.getByText('8 L', { exact: true })).toBeVisible();
  await expect(page.getByText('À commander', { exact: true })).toBeVisible();

  await page.goto('/aujourdhui');
  await expect(page.getByRole('link', { name: /1 consommable\(s\) à commander/ })).toHaveAttribute('href', '/pressing/stock');

  await page.goto('/pressing/stock');
  await page.getByRole('button', { name: 'Payer Togo Détergents' }).click();
  await expect(page.getByLabel('Montant (F CFA)')).toHaveValue('60000');
  // The row's button opened the form; the form's own button asks to confirm.
  await page.getByRole('button', { name: 'Payer Togo Détergents' }).last().click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Payer Togo Détergents' }).click();
  await expect(page.getByText('60 000 F CFA payés à Togo Détergents.')).toBeVisible();
  await expect(page.getByText('rien de dû')).toBeVisible();
  // The payment is an expense of the day.
  await page.goto('/argent/depenses');
  await expect(page.getByText('Togo Détergents').first()).toBeVisible();
  expect(await sideways(page)).toBe(0);
});
