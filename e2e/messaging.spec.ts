import { expect, test } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn } from './session';

// Specs/006-messaging in a browser, at 375 px: the laundry turns the receipt on with its own
// words, and a deposit queues it. No channel is connected in this test: the message waits, and the
// screen says so — nothing is simulated.

const organizationId = freshOrganization('messaging');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };

test.describe.configure({ mode: 'serial' });

test('the laundry turns the receipt on, with its own words', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/demarrage');
  await page.getByLabel('Nom du pressing').fill('Pressing Afi');
  await page.getByLabel('Nom du point').fill('Agoè');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page).toHaveURL(/\/pressing\/schema$/);

  await page.goto('/pressing/messages');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Messages aux clients');
  await expect(page.getByText('WhatsApp : non branché')).toBeVisible();
  await expect(page.getByText('Telegram : non branché')).toBeVisible();
  // Nettio proposes words; the preview fills them with a sample.
  const receipt = page.locator('section', { hasText: 'Quand un dépôt est reçu.' });
  await expect(receipt.getByText(/Bonjour Mme Adjovi\. Dépôt A-0412 reçu : 4 Chemise, 2 Pantalon\./)).toBeVisible();

  await receipt.getByLabel('Vos mots').fill('Bonjour {client}. Dépôt {numero} bien reçu. — {pressing}');
  await expect(receipt.getByText('Bonjour Mme Adjovi. Dépôt A-0412 bien reçu. — Pressing Afi')).toBeVisible();
  await receipt.getByLabel('Envoyer ce message').check();
  await receipt.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(receipt.getByText('Activé', { exact: true })).toBeVisible();
  await shot(page, '25-messages');
  expect(await sideways(page)).toBe(0);
});

test('a deposit queues its receipt; with no channel connected, it waits', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/pressing/catalogue');
  await page.getByRole('button', { name: 'Prix' }).click();
  const shirt = page.getByLabel('Chemise', { exact: true });
  await shirt.fill('500');
  await shirt.blur();
  await expect(page.getByText('500 F CFA', { exact: true })).toBeVisible();

  await page.goto('/depots/nouveau');
  await page.getByLabel('Téléphone').fill('90 12 34 56');
  await page.getByLabel('Nom', { exact: true }).fill('Mme Adjovi');
  await page.getByRole('button', { name: 'Ajouter une pièce : Chemise' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A-0001');

  await page.goto('/pressing/messages');
  await expect(page.getByText('Mme Adjovi · A-0001')).toBeVisible();
  await expect(page.getByText('Bonjour Mme Adjovi. Dépôt A-0001 bien reçu. — Pressing Afi')).toBeVisible();
  await expect(page.getByText('En attente', { exact: true })).toBeVisible();
  await expect(page.getByText('le canal n’est pas branché')).toBeVisible();
  await shot(page, '26-messages-log');
});
