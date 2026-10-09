import { expect, test, type Page } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn } from './session';

// Specs/018-basket in a browser: one deposit holds several services at once — pieces to wash and
// iron, pieces to iron only, laundry by the kilo — and its basket stays in sight, service by
// service, with its total.

const organizationId = freshOrganization('basket');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };

test.describe.configure({ mode: 'serial' });

async function setPrice(page: Page, service: string, label: string, amount: string) {
  await page.getByLabel('Service').selectOption({ label: service });
  const field = page.getByLabel(label, { exact: true });
  await field.fill(amount);
  await field.blur();
  await expect(page.getByText(`${amount} F CFA`, { exact: true }).first()).toBeVisible();
}

test('the owner sets prices on three services', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/demarrage');
  await page.getByLabel('Nom du pressing').fill('Pressing Afi');
  await page.getByLabel('Nom du point').fill('Agoè');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page).toHaveURL(/\/pressing\/schema$/);
  await page.goto('/pressing/catalogue');
  await page.getByRole('button', { name: 'Prix' }).click();
  await setPrice(page, 'Lavage et repassage', 'Chemise', '500');
  await setPrice(page, 'Repassage seul', 'Pantalon', '300');
  await setPrice(page, 'Linge au kilo', 'Prix d’un kilo', '600');
});

test('one deposit, three services: the basket shows each one and the total', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/depots/nouveau');
  await expect(page.getByRole('heading', { name: 'Panier', exact: true })).toBeVisible();
  await expect(page.getByText('plusieurs services tiennent dans le même dépôt', { exact: false })).toBeVisible();
  await page.getByLabel('Téléphone').fill('90 12 34 56');
  await page.getByLabel('Nom', { exact: true }).fill('Mme Adjovi');

  // Pieces to wash and iron.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Ajouter une pièce : Chemise' }).click();
  // Pieces to iron only: another service, the same deposit.
  await page.getByRole('button', { name: 'Repassage seul' }).click();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Ajouter une pièce : Pantalon' }).click();
  // Laundry by the kilo.
  await page.getByRole('button', { name: 'Linge au kilo' }).click();
  await page.getByLabel('Poids (kg)').fill('3.5');

  // Each service says what it already holds; nothing entered elsewhere is lost from sight.
  await expect(page.getByRole('button', { name: 'Lavage et repassage 4' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Repassage seul 2' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Linge au kilo 3,5 kg' })).toBeVisible();

  await expect(page.getByRole('region', { name: 'Panier · 3 service(s)' })).toBeVisible();
  const basket = page.locator('#panier');
  await expect(basket.getByRole('heading', { name: 'Lavage et repassage' })).toBeVisible();
  await expect(basket.getByRole('heading', { name: 'Repassage seul' })).toBeVisible();
  await expect(basket.getByRole('heading', { name: 'Linge au kilo' })).toBeVisible();
  await expect(basket.getByText('2 000 F CFA')).toBeVisible();
  await expect(basket.getByText('600 F CFA')).toBeVisible();
  await expect(basket.getByText('2 100 F CFA')).toBeVisible();
  await expect(basket.getByText('4 700 F CFA')).toBeVisible();

  // On a phone, the basket follows the thumb with its total.
  const bar = page.getByRole('link', { name: /^Panier/ });
  await expect(bar).toContainText('4 700 F CFA');
  await shot(page, '31-basket');
  expect(await sideways(page)).toBe(0);

  // A line taken out of the basket leaves the deposit.
  await basket.getByRole('button', { name: 'Retirer du panier : Pantalon · Repassage seul' }).click();
  await expect(page.getByRole('region', { name: 'Panier · 2 service(s)' })).toBeVisible();
  await expect(basket.getByText('4 100 F CFA')).toBeVisible();

  await bar.click();
  await basket.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A-0001');
  await expect(page.getByText('4 100 F CFA').first()).toBeVisible();
});

test('on a wide screen the basket stands beside the articles', async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(context, afi);
  await page.goto('/depots/nouveau');
  await page.getByLabel('Téléphone').fill('90 12 34 56');
  await page.getByRole('button', { name: 'Ajouter une pièce : Chemise' }).click();
  const tile = await page.getByRole('button', { name: 'Ajouter une pièce : Chemise' }).boundingBox();
  const basket = await page.getByRole('region', { name: 'Panier · 1 service(s)' }).boundingBox();
  expect(basket && tile && basket.x > tile.x + tile.width).toBe(true);
  await expect(page.getByRole('link', { name: /Panier · 1 service/ })).toBeHidden();
  await shot(page, '32-basket-desktop');
});
