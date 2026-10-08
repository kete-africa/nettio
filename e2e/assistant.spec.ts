import { expect, test } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn } from './session';

// Specs/007-intelligence in a browser, at 375 px: the day's statement on « Aujourd'hui », and
// « Demander » saying it is not connected — no model is configured in this test, and nothing is
// simulated.

const organizationId = freshOrganization('assistant');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };

test('the owner reads the day’s statement; « Demander » says it is not connected', async ({
  page,
  context,
}) => {
  await signIn(context, afi);
  await page.goto('/demarrage');
  await page.getByLabel('Nom du pressing').fill('Pressing Afi');
  await page.getByLabel('Nom du point').fill('Agoè');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page).toHaveURL(/\/pressing\/schema$/);

  await page.goto('/aujourdhui');
  await expect(page.getByRole('heading', { name: 'Relevé du jour' })).toBeVisible();
  await expect(page.getByText('Aucun dépôt ni encaissement aujourd’hui.')).toBeVisible();
  await expect(page.getByText(/Ce mois-ci : 0 F CFA encaissés, 0 F CFA de charges/)).toBeVisible();
  await expect(page.getByText('Aucune phrase n’est écrite par une IA.', { exact: false })).toBeVisible();
  await shot(page, '27-statement');
  expect(await sideways(page)).toBe(0);

  await page.goto('/demander');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Demander');
  await expect(page.getByText('« Demander » n’est pas branché')).toBeVisible();
  await shot(page, '28-ask');
});
