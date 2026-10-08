import { expect, test } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn } from './session';

// Specs/013-statement-sent in a browser, at 375 px: the owner decides where her evening statement
// leaves to. No channel is connected in this test: the screen says so, and nothing is simulated.

const organizationId = freshOrganization('statement');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };
const essi = { userId: `usr_essi_${organizationId}`, name: 'Essi', organizationId, role: 'member' as const };

test('the owner turns her evening statement on, and checks where it goes', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/demarrage');
  await page.getByLabel('Nom du pressing').fill('Pressing Afi');
  await page.getByLabel('Nom du point').fill('Agoè');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page).toHaveURL(/\/pressing\/schema$/);

  // From the day's statement to where it leaves to.
  await page.goto('/aujourdhui');
  await page.getByRole('link', { name: 'Le recevoir chaque soir' }).click();
  await expect(page).toHaveURL(/\/pressing\/releve$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Relevé du soir');
  await expect(page.getByText('Aucun relevé n’est encore parti tout seul.')).toBeVisible();
  await expect(page.getByText('E-mail n’est pas branché sur ce Nettio', { exact: false })).toBeVisible();

  // Turned on with nowhere to go: refused, with what to do.
  await page.getByLabel('Envoyer le relevé chaque soir').check();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Le relevé n’a nulle part où partir.');

  await page.getByLabel('Adresse e-mail').fill('afi@example.test');
  await page.getByLabel('Numéro WhatsApp').fill('90 12 34 56');
  await page.getByLabel('Heure d’envoi').selectOption('19');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Enregistré : le relevé partira chaque soir à 19 h.')).toBeVisible();

  // Kept, with the laundry's prefix on the number.
  await page.reload();
  await expect(page.getByLabel('Envoyer le relevé chaque soir')).toBeChecked();
  await expect(page.getByLabel('Numéro WhatsApp')).toHaveValue('+22890123456');
  await expect(page.getByLabel('Heure d’envoi')).toHaveValue('19');

  // Sent now: no channel is connected here, and each one says so.
  await page.getByRole('button', { name: 'Envoyer le relevé maintenant' }).click();
  await expect(page.getByText('Envoi de maintenant, aux adresses enregistrées :')).toBeVisible();
  await expect(page.getByText('Canal non branché')).toHaveCount(2);
  await shot(page, '29-statement-delivery');
  expect(await sideways(page)).toBe(0);
});

test('who does not decide it does not see it', async ({ page, context }) => {
  await signIn(context, essi);
  await page.goto('/pressing/releve');
  await expect(page.getByText('Vous n’avez pas le droit de faire cela', { exact: false })).toBeVisible();
});
