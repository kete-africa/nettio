import { expect, test } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn } from './session';

// Specs/001-foundation in a browser, at 375 px: the owner starts her laundry, sees it drawn, sets a
// price and a pack, and gives a newcomer her role; the newcomer only sees what she may open.

const organizationId = freshOrganization('foundation');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };
const mawuli = {
  userId: `usr_mawuli_${organizationId}`,
  name: 'Mawuli',
  organizationId,
  role: 'member' as const,
};

test.describe.configure({ mode: 'serial' });

test('anyone not signed in is sent to the Compte Kete', async ({ request }) => {
  const response = await request.get('/aujourdhui', { maxRedirects: 0 });
  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
  expect(response.headers()['location']).toContain('/auth/connexion');
});

test('the owner starts her laundry and lands on its diagram', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/');
  await expect(page).toHaveURL(/\/demarrage$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Démarrer votre pressing');
  await shot(page, '01-start');
  expect(await sideways(page)).toBe(0);

  await page.getByLabel('Nom du pressing').fill('Pressing Afi');
  await page.getByLabel('Plusieurs points').check();
  await page.getByLabel('Nom du point').fill('Agoè');
  await page.getByLabel('Code').fill('a');
  await page.getByRole('button', { name: 'Démarrer' }).click();

  await expect(page).toHaveURL(/\/pressing\/schema$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Le schéma de votre pressing');
  // The diagram is drawn from the settings: the counter, the plant it sends to, the routes.
  const diagram = page.getByRole('img', { name: 'Le schéma de votre pressing' });
  await expect(diagram.locator('.react-flow__node', { hasText: 'Agoè (A)' })).toBeVisible();
  await expect(diagram.locator('.react-flow__node', { hasText: 'Centre de traitement (C)' })).toBeVisible();
  await expect(diagram.locator('.react-flow__node', { hasText: 'Lavage et repassage' })).toBeVisible();
  await expect(diagram.locator('.react-flow__edge')).not.toHaveCount(0);
  // Its text equivalent says each route.
  await expect(page.getByText('Repassage → Contrôle → Rangement', { exact: true })).toBeVisible();
  await shot(page, '02-diagram');
  expect(await sideways(page)).toBe(0);
});

test('the diagram on a desktop screen', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(context, afi);
  await page.goto('/pressing/schema');
  await expect(page.locator('.react-flow__node', { hasText: 'Linge au kilo' })).toBeVisible();
  // The sidebar shows the laundry's name and the places the owner may open.
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toContainText(
    'Équipe et droits',
  );
  await shot(page, '03-diagram-desktop');
});

test('today says what is missing before the counter can sell', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/aujourdhui');
  await expect(page.getByText('4 service(s) sans prix')).toBeVisible();
  await shot(page, '04-today');
});

test('the owner sets a price, a pack and a route', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/pressing/catalogue');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Catalogue');
  await shot(page, '05-catalog-services');

  await page.getByRole('button', { name: 'Prix' }).click();
  await expect(page.getByText('Nettio ne propose jamais de prix')).toBeVisible();
  const shirt = page.getByLabel('Chemise');
  await shirt.fill('500');
  await shirt.blur();
  await expect(page.getByText('500 F CFA')).toBeVisible();
  await shot(page, '06-catalog-prices');

  await page.getByRole('button', { name: /^Forfaits/ }).click();
  await page.getByRole('button', { name: 'Ajouter un forfait' }).click();
  await page.getByLabel('Nom', { exact: true }).fill('Business 12 pièces');
  await page.getByLabel('Nombre de pièces').fill('12');
  await page.getByLabel('Prix', { exact: true }).fill('6000');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('cell', { name: 'Business 12 pièces' })).toBeVisible();
  await expect(page.getByText('6 000 F CFA')).toBeVisible();
  await shot(page, '07-catalog-packs');
  expect(await sideways(page)).toBe(0);
});

test('a newcomer waits for a role; the owner gives it; she sees only what she may', async ({
  page,
  context,
}) => {
  await signIn(context, mawuli);
  await page.goto('/aujourdhui');
  await expect(page.getByText('Vous n’avez pas encore de rôle')).toBeVisible();
  await shot(page, '08-no-role');

  await signIn(context, afi);
  await page.goto('/pressing/equipe');
  await expect(page.getByText('En attente d’un rôle', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mawuli' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Rôle').selectOption('counter');
  await drawer.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('cell', { name: 'Réception' })).toBeVisible();
  await shot(page, '09-team');

  await signIn(context, mawuli);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/aujourdhui');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav).toContainText('Catalogue');
  await expect(nav).not.toContainText('Équipe et droits');
  await expect(nav).not.toContainText('Réglages');
  // She reads the catalogue and cannot change it.
  await page.goto('/pressing/catalogue');
  await expect(page.getByRole('button', { name: 'Ajouter un service' })).toHaveCount(0);
  // A place she may not open says so instead of breaking.
  await page.goto('/pressing/equipe');
  await expect(page.getByText('Vous n’avez pas le droit de faire cela.')).toBeVisible();
});

test('the owner changes the settings', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/pressing/reglages');
  await page.getByLabel('Délai habituel (heures)').fill('72');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Enregistré')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Délai habituel (heures)')).toHaveValue('72');
  await shot(page, '10-settings');
  expect(await sideways(page)).toBe(0);
});

test('the screens exist in English', async ({ page, context }) => {
  await signIn(context, afi, 'en');
  await page.goto('/pressing/schema');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The diagram of your laundry');
});
