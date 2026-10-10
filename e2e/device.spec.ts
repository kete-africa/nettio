import { expect, test } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn } from './session';

// Specs/031-device in a browser, at 375 px: this device's paper and labels, a label's bar code, a
// scanner that opens a deposit, and a counter that keeps a deposit while the network is away.

const organizationId = freshOrganization('device');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };

test.describe.configure({ mode: 'serial' });

test('a first deposit; this device’s paper and labels', async ({ page, context }) => {
  // A long scenario — a laundry set up, a deposit, three screens: more time on a slow database.
  test.slow();
  await signIn(context, afi);
  await page.goto('/demarrage');
  await page.getByLabel('Nom du pressing').fill('Pressing Afi');
  await page.getByLabel('Nom du point').fill('Agoè');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page).toHaveURL(/\/pressing\/schema$/, { timeout: 60_000 });
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

  await page.goto('/pressing/appareil');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cet appareil');
  await page.getByLabel('Ticket 58 mm').click();
  await expect(page.getByText('Enregistré sur cet appareil.')).toBeVisible();
  await page.getByLabel('Largeur (mm)').fill('60');
  await page.getByLabel('Hauteur (mm)').fill('40');
  await page.getByRole('button', { name: 'Enregistrer sur cet appareil' }).first().click();
  await expect(page.getByRole('img', { name: 'Code-barres du dépôt A-0412' })).toBeVisible();
  await shot(page, '57-device');
  expect(await sideways(page)).toBe(0);

  // The ticket fits the paper chosen on this device.
  await page.goto('/depots');
  await page.getByText('A-0001').first().click();
  await page.getByRole('link', { name: 'Reçu' }).click();
  await expect.poll(() => page.locator('main style').first().textContent()).toContain('size: 58mm auto');
});

test('each piece has its label, with the deposit’s number as a bar code; a scanner opens the deposit', async ({ page, context }) => {
  await signIn(context, afi);
  // The settings are this device's own: another browser starts from the defaults.
  await page.goto('/pressing/appareil');
  await expect(page.getByLabel('Largeur (mm)')).toHaveValue('50');
  await page.getByLabel('Largeur (mm)').fill('60');
  await page.getByLabel('Hauteur (mm)').fill('40');
  await page.getByRole('button', { name: 'Enregistrer sur cet appareil' }).first().click();
  await expect(page.getByText('Enregistré sur cet appareil.')).toBeVisible();
  await page.goto('/depots');
  await page.getByText('A-0001').first().click();
  await page.getByRole('link', { name: 'Étiquettes' }).click();
  await expect(page.getByRole('button', { name: /Imprimer \d+ étiquette\(s\)/ })).toBeVisible();
  await expect(page.getByText('Format 60 × 40 mm', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Code-barres du dépôt A-0001' }).first()).toBeVisible();
  await expect.poll(() => page.locator('main style').first().textContent()).toContain('size: 60mm 40mm');
  await shot(page, '58-labels');
  expect(await sideways(page)).toBe(0);

  // A scanner is a keyboard: it types the number and presses Enter.
  await page.goto('/aujourdhui');
  const search = page.getByRole('searchbox');
  await search.fill('a-0001');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/depots\/ord_/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A-0001');
});

test('with no network the counter keeps the deposit, and sends it once the network returns', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/depots/nouveau');
  await page.getByLabel('Téléphone').fill('90 12 34 56');
  await expect(page.getByText('Mme Adjovi').first()).toBeVisible();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Ajouter une pièce : Chemise' }).click();
  await expect(page.locator('#panier').getByText('1 000 F CFA').first()).toBeVisible();

  await context.setOffline(true);
  await page.locator('#panier').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Pas de réseau : ce dépôt est gardé sur cet appareil.', { exact: false })).toBeVisible();
  const kept = page.getByRole('region', { name: 'Dépôts gardés sur cet appareil' });
  await expect(kept.getByText('1 dépôt(s) en attente d’envoi : pas de réseau.')).toBeVisible();
  await expect(kept.getByText('Mme Adjovi · 1 000 F CFA', { exact: false })).toBeVisible();
  // A phone that cannot be looked up: the name is typed, Nettio matches it when it is sent.
  await page.getByLabel('Téléphone').fill('91 00 00 01');
  await expect(page.getByText('Pas de réseau : tapez le nom.', { exact: false })).toBeVisible();
  await shot(page, '59-offline');
  expect(await sideways(page)).toBe(0);

  // The network returns: the deposit leaves by itself, nobody has to remember it.
  await context.setOffline(false);
  await expect(kept.getByText('Envoyé : A-0002.')).toBeVisible({ timeout: 60_000 });
  await expect(kept.getByText('en attente', { exact: false })).toHaveCount(0);
  // Sent once: the deposit is there, with its number, and only once.
  await page.goto('/depots');
  await expect(page.getByText('A-0002')).toHaveCount(1);
  await expect(page.getByText('A-0003')).toHaveCount(0);
});
