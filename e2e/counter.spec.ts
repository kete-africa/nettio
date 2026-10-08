import { expect, test, type Page } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn, throughTheWorkshop } from './session';

// Specs/002-counter in a browser, at 375 px: a deposit under a pack with its real content, the
// money taken with it, ready, handed over with its balance — and the receipt.

const organizationId = freshOrganization('counter');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };

test.describe.configure({ mode: 'serial' });

async function setPrice(page: Page, article: string, amount: string) {
  const field = page.getByLabel(article, { exact: true });
  await field.fill(amount);
  await field.blur();
  await expect(page.getByText(`${amount} F CFA`, { exact: true }).first()).toBeVisible();
}

test('the owner starts her laundry and sets her prices and a pack', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/demarrage');
  await page.getByLabel('Nom du pressing').fill('Pressing Afi');
  await page.getByLabel('Nom du point').fill('Agoè');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page).toHaveURL(/\/pressing\/schema$/);

  // No price yet: the counter says so instead of showing an empty form.
  await page.goto('/depots/nouveau');
  await expect(page.getByText('Aucun prix au catalogue')).toBeVisible();

  await page.goto('/pressing/catalogue');
  await page.getByRole('button', { name: 'Prix' }).click();
  await setPrice(page, 'Chemise', '500');
  await setPrice(page, 'Pantalon', '600');
  await page.getByRole('button', { name: /^Forfaits/ }).click();
  await page.getByRole('button', { name: 'Ajouter un forfait' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Nom', { exact: true }).fill('Business 12 pièces');
  await drawer.getByLabel('Nombre de pièces').fill('12');
  await drawer.getByLabel('Prix', { exact: true }).fill('6000');
  await drawer.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('cell', { name: 'Business 12 pièces' })).toBeVisible();
});

test('a deposit under a pack keeps its real content, and money is taken with it', async ({
  page,
  context,
}) => {
  await signIn(context, afi);
  await page.goto('/depots/nouveau');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nouveau dépôt');
  await page.getByLabel('Téléphone').fill('90 12 34 56');
  await page.getByLabel('Nom', { exact: true }).fill('Mme Adjovi');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Ajouter une pièce : Chemise' }).click();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Ajouter une pièce : Pantalon' }).click();
  // Without a pack: the sum of the lines.
  await expect(page.getByText('3 200 F CFA').last()).toBeVisible();
  await page.getByLabel('Forfait').selectOption({ label: 'Business 12 pièces — 6 000 F CFA' });
  await expect(page.getByText('6 pièce(s) couverte(s) sur 12')).toBeVisible();
  await expect(page.getByText('6 000 F CFA').last()).toBeVisible();
  await shot(page, '11-new-order');
  expect(await sideways(page)).toBe(0);

  await page.getByRole('button', { name: 'Encaisser' }).click();
  await page.getByLabel('Montant (F CFA)').fill('3000');
  await page.getByRole('button', { name: 'Mobile Money' }).click();
  await page.getByRole('button', { name: 'Enregistrer et encaisser' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A-0001');
  await expect(page.getByText('Mme Adjovi')).toBeVisible();
  await expect(page.getByText('Acompte · Mobile Money')).toBeVisible();
  await shot(page, '12-order');
  expect(await sideways(page)).toBe(0);
});

test('the receipt prints and goes out by WhatsApp or Telegram', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/depots');
  await page.getByText('A-0001 · Mme Adjovi').click();
  await page.getByRole('link', { name: 'Reçu' }).click();
  await expect(page.getByText('Pressing Afi').first()).toBeVisible();
  await expect(page.getByText('A-0001').first()).toBeVisible();
  const whatsapp = page.getByRole('link', { name: 'Envoyer par WhatsApp' });
  await expect(whatsapp).toHaveAttribute('href', /^https:\/\/wa\.me\/22890123456\?text=Bonjour/);
  await expect(page.getByRole('link', { name: 'Ouvrir Telegram' })).toHaveAttribute(
    'href',
    'https://t.me/+22890123456',
  );
  await expect(page.getByText(/Dépôt A-0001 reçu : 4 Chemise, 2 Pantalon \(Business 12 pièces\)/)).toBeVisible();
  await shot(page, '13-receipt');
});

test('ready, then handed over with its balance; the day counts it', async ({ page, context }) => {
  await signIn(context, afi);
  // Ready comes from the workshop: every step of its route validated (specs/005-workshop).
  await throughTheWorkshop(page, 'A-0001');
  await page.goto('/depots?etape=ready');
  await page.getByText('A-0001 · Mme Adjovi').click();
  await expect(page.getByText('Prêt', { exact: true }).first()).toBeVisible();
  let drawer = page.getByRole('dialog');

  await page.getByRole('button', { name: 'Remettre' }).click();
  drawer = page.getByRole('dialog');
  await expect(drawer.getByLabel('Montant (F CFA)')).toHaveValue('3000');
  // Cash needs an open till in a team (specs/003-money-day): the message says what to do.
  await drawer.getByRole('button', { name: 'Remettre' }).click();
  await expect(drawer.getByText('Ouvrez votre caisse')).toBeVisible();
  await drawer.getByRole('button', { name: 'Mobile Money' }).click();
  await drawer.getByRole('button', { name: 'Remettre' }).click();
  await expect(page.getByText('Retiré', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Remis au client')).toBeVisible();
  await shot(page, '14-order-collected');

  await page.goto('/aujourdhui');
  // Cashed today: 3 000 with the deposit, 3 000 at the handing over.
  await expect(page.getByText('6 000', { exact: true })).toBeVisible();
  await shot(page, '15-today');
  expect(await sideways(page)).toBe(0);

  await page.goto('/depots?etape=closed');
  await expect(page.getByText('A-0001 · Mme Adjovi')).toBeVisible();
  await page.goto('/clients');
  await page.getByText('Mme Adjovi').click();
  await expect(page.getByText('+228 90 12 34 56')).toBeVisible();
  await shot(page, '16-customer');
});
