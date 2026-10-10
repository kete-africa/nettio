import { expect, test, type Page } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn } from './session';

// Specs/028-sites in a browser, at 375 px: a plant and a counter, a deposit that travels with its
// slip, the result per site, a partner's point.

const organizationId = freshOrganization('network');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };

test.describe.configure({ mode: 'serial' });

async function addSite(page: Page, site: { name: string; code: string; kind: string; plant?: string }) {
  await page.getByRole('button', { name: 'Ajouter un point' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Nom du point').fill(site.name);
  await drawer.getByLabel('Code').fill(site.code);
  await drawer.getByLabel('Ce qu’il fait').selectOption({ label: site.kind });
  if (site.plant) await drawer.getByLabel('Envoie son linge à').selectOption({ label: site.plant });
  await drawer.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('cell', { name: site.name, exact: true })).toBeVisible();
}

test('a plant, a counter that sends it its laundry, and a deposit received there', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/demarrage');
  await page.getByLabel('Nom du pressing').fill('Pressing Afi');
  await page.getByLabel('Nom du point').fill('Agoè');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page).toHaveURL(/\/pressing\/schema$/);

  // One site: nothing travels.
  await page.goto('/pressing/reseau');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Réseau de points');
  await expect(page.getByText('Vous avez un seul point : rien ne voyage.')).toBeVisible();

  await page.goto('/pressing/points');
  await addSite(page, { name: 'Centre', code: 'C', kind: 'Centre de traitement' });
  await addSite(page, { name: 'Bè', code: 'B', kind: 'Comptoir', plant: 'Centre' });

  await page.goto('/pressing/catalogue');
  await page.getByRole('button', { name: 'Prix' }).click();
  const price = page.getByLabel('Chemise', { exact: true });
  await price.fill('500');
  await price.blur();
  await expect(page.getByText('500 F CFA', { exact: true }).first()).toBeVisible();
  await page.goto('/depots/nouveau');
  await page.getByLabel('Point', { exact: true }).selectOption({ label: 'Bè (B)' });
  await page.getByLabel('Téléphone').fill('90 12 34 56');
  await page.getByLabel('Nom', { exact: true }).fill('Mme Adjovi');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Ajouter une pièce : Chemise' }).click();
  await page.locator('#panier').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('B-0001');
});

test('the deposit leaves for the plant with its slip, and is checked on arrival', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/pressing/reseau');
  const toSend = page.getByRole('region', { name: 'À envoyer' });
  await expect(toSend.getByText('Bè → Centre')).toBeVisible();
  await expect(toSend.getByLabel('B-0001 · Mme Adjovi')).toBeChecked();
  await shot(page, '51-network');
  expect(await sideways(page)).toBe(0);
  await toSend.getByRole('button', { name: 'Envoyer 1 dépôt(s) vers Centre' }).click();
  await expect(page.getByText('1 dépôt(s) partis vers Centre, avec leur bordereau.')).toBeVisible();
  await expect(toSend.getByText('Rien à envoyer', { exact: false })).toBeVisible();

  const road = page.getByRole('region', { name: 'En route et reçus' });
  await expect(road.getByRole('link', { name: 'Bordereau T-0001' })).toBeVisible();
  await road.getByRole('button', { name: 'Réceptionner (1 sur 1)' }).click();
  await expect(page.getByText('Bordereau T-0001 reçu : tout y est.')).toBeVisible();
  await expect(road.getByText('1 reçus sur 1')).toBeVisible();

  // The slip, as it travels with the bags.
  await road.getByRole('link', { name: 'T-0001' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bordereau T-0001');
  await expect(page.getByText('Bè → Centre')).toBeVisible();
  await expect(page.getByText('1 dépôt(s) · 4 pièce(s)', { exact: false })).toBeVisible();
  await shot(page, '52-transfer-slip');
  expect(await sideways(page)).toBe(0);
});

test('each site’s result, and a partner’s point', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/pressing/reseau');
  const result = page.getByRole('region', { name: 'Résultat par point' });
  await expect(result.getByText('1 dépôt(s), 4 pièce(s), 2 000 F CFA de ventes')).toBeVisible();
  await expect(result.getByText('Résultat du pressing', { exact: true })).toBeVisible();
  await result.getByLabel('À parts égales').click();
  await expect(page.getByText('Répartition enregistrée.')).toBeVisible();

  const partners = page.getByRole('region', { name: 'Points partenaires' });
  await partners.getByRole('button', { name: 'Partenaire de Bè' }).click();
  await partners.getByLabel('Nom du partenaire').fill('Boutique Chez Ama');
  await partners.getByLabel('Commission (%)').fill('10');
  await partners.getByRole('button', { name: 'Enregistrer le partenaire' }).click();
  await expect(page.getByText('Partenaire « Boutique Chez Ama » enregistré.')).toBeVisible();
  await expect(partners.getByText('Tenu par Boutique Chez Ama · commission 10 %')).toBeVisible();
  await expect(result.getByText('Commission du mois : 200 F CFA.', { exact: false })).toBeVisible();
  await shot(page, '53-sites-result');
  expect(await sideways(page)).toBe(0);
});
