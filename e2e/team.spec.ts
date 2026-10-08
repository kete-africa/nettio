import { expect, test } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn } from './session';

// Specs/015-team-pay in a browser, at 375 px: the owner reads the team's work and sets a piece
// rate — hers to decide; Nettio proposes none.

const organizationId = freshOrganization('team');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };

test('the owner sets what a piece is paid at a step', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/demarrage');
  await page.getByLabel('Nom du pressing').fill('Pressing Afi');
  await page.getByLabel('Nom du point').fill('Agoè');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page).toHaveURL(/\/pressing\/schema$/);

  await page.goto('/pressing/travail');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Travail et paie');
  await expect(page.getByText('Aucune étape validée ni somme remise ce mois-ci.')).toBeVisible();
  await expect(page.getByText('Nettio ne propose aucun taux.', { exact: false })).toBeVisible();

  // No rate until the owner types one.
  const wash = page.getByLabel('Lavage', { exact: true });
  await expect(wash).toHaveValue('');
  await wash.fill('25');
  await page.getByRole('button', { name: 'Enregistrer Lavage', exact: true }).click();
  await expect(page.getByText('Enregistré : Lavage, 25 F CFA la pièce.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Lavage', { exact: true })).toHaveValue('25');

  // Emptied: the step is no longer paid by the piece.
  await page.getByLabel('Lavage', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Enregistrer Lavage', exact: true }).click();
  await expect(page.getByText('Enregistré : Lavage n’est plus payée à la pièce.')).toBeVisible();
  await expect(page.getByLabel('Lavage', { exact: true })).toHaveValue('');
  await page.reload();
  await expect(page.getByLabel('Lavage', { exact: true })).toHaveValue('');
  await shot(page, '30-work-and-pay');
  expect(await sideways(page)).toBe(0);
});
