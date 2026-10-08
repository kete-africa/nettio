import { expect, test } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn } from './session';

// Specs/003-money-day and 004-earn in a browser, at 375 px: the till follows every franc and keeps
// its gap; expenses are fixed or variable; a cost sheet gives a piece its cost; and the result
// says what a pack earns on its real content.

const organizationId = freshOrganization('money');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };

test.describe.configure({ mode: 'serial' });

test('the owner starts, prices a shirt and a pack, and opens her till', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/demarrage');
  await page.getByLabel('Nom du pressing').fill('Pressing Afi');
  await page.getByLabel('Nom du point').fill('Agoè');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page).toHaveURL(/\/pressing\/schema$/);

  await page.goto('/pressing/catalogue');
  await page.getByRole('button', { name: 'Prix' }).click();
  const shirt = page.getByLabel('Chemise', { exact: true });
  await shirt.fill('500');
  await shirt.blur();
  await expect(page.getByText('500 F CFA', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Forfaits/ }).click();
  await page.getByRole('button', { name: 'Ajouter un forfait' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Nom', { exact: true }).fill('Business 12 pièces');
  await drawer.getByLabel('Nombre de pièces').fill('12');
  await drawer.getByLabel('Prix', { exact: true }).fill('6000');
  await drawer.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('cell', { name: 'Business 12 pièces' })).toBeVisible();

  await page.goto('/argent/caisse');
  await expect(page.getByText('Aucune caisse ouverte')).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir ma caisse' }).click();
  const till = page.getByRole('dialog');
  await till.getByLabel('Fond d’ouverture (F CFA)').fill('10000');
  await till.getByRole('button', { name: 'Ouvrir ma caisse' }).click();
  await expect(page.getByText('Attendu')).toBeVisible();
  await expect(page.getByText('10 000 F CFA').first()).toBeVisible();
});

test('cash from a deposit and an expense move what the till should hold', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/depots/nouveau');
  await page.getByLabel('Téléphone').fill('90 12 34 56');
  await page.getByLabel('Nom', { exact: true }).fill('Mme Adjovi');
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Ajouter une pièce : Chemise' }).click();
  await page.getByLabel('Forfait').selectOption({ label: 'Business 12 pièces — 6 000 F CFA' });
  await page.getByRole('button', { name: 'Encaisser' }).click();
  await page.getByLabel('Montant (F CFA)').fill('2000');
  await page.getByRole('button', { name: 'Enregistrer et encaisser' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A-0001');

  await page.goto('/argent/depenses');
  await page.getByRole('button', { name: 'Ajouter une dépense' }).click();
  let drawer = page.getByRole('dialog');
  await drawer.getByLabel('Libellé').fill('Cintres');
  await drawer.getByLabel('Catégorie').selectOption('packaging');
  await drawer.getByLabel('Montant (F CFA)').fill('1500');
  await drawer.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Cintres', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Ajouter une dépense' }).click();
  drawer = page.getByRole('dialog');
  await drawer.getByLabel('Libellé').fill('Loyer');
  await drawer.getByLabel('Catégorie').selectOption('rent');
  await drawer.getByLabel('Montant (F CFA)').fill('10000');
  await drawer.getByLabel('Payée par').selectOption('bank');
  await drawer.getByLabel('Revient chaque mois').check();
  await drawer.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Chaque mois', { exact: true })).toBeVisible();
  await expect(page.getByText('11 500', { exact: true })).toBeVisible();
  await shot(page, '17-expenses');
  expect(await sideways(page)).toBe(0);

  await page.goto('/argent/caisse');
  // 10 000 of float + 2 000 cashed − 1 500 paid from the till.
  await expect(page.getByText('10 500 F CFA')).toBeVisible();
  await shot(page, '18-till');
});

test('a cost sheet gives a piece its cost, and the result says what the pack earns', async ({
  page,
  context,
}) => {
  await signIn(context, afi);
  await page.goto('/argent/resultat');
  await expect(page.getByText('Aucune pièce de ce mois n’a de fiche de coût')).toBeVisible();
  await expect(page.getByText('Jamais mesuré', { exact: true })).toBeVisible();

  await page.goto('/argent/couts');
  await expect(page.getByText('1 pièce(s) en vente n’ont pas de fiche de coût')).toBeVisible();
  await page.getByRole('button', { name: 'Chemise · Lavage et repassage' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Minutes de travail').fill('6');
  await drawer.getByLabel('Consommables (F CFA)').fill('120');
  await drawer.getByLabel('Machine (F CFA)').fill('40');
  await drawer.getByRole('radio', { name: /^Mesuré/ }).check();
  await drawer.getByRole('button', { name: 'Enregistrer' }).click();
  // Variable 160; the month's 10 000 of fixed charges over 8 shirts × 6 minutes: 1 250 a shirt.
  await expect(page.getByRole('cell', { name: '160 F CFA' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '1 410 F CFA' })).toBeVisible();
  await shot(page, '19-costs');

  await page.goto('/argent/resultat');
  // The pack: 6 000 − 8 × 1 410 = − 5 280: shown as it is.
  await expect(page.getByText('Business 12 pièces', { exact: true })).toBeVisible();
  await expect(page.getByText('− 5 280 F CFA')).toBeVisible();
  await expect(page.getByText('Mesuré', { exact: true })).toBeVisible();
  await expect(page.getByText('Encaissé = paiements − remboursements du mois')).toBeVisible();
  await shot(page, '20-result');
  expect(await sideways(page)).toBe(0);
});

test('the till closes with its gap, kept as it is', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/argent/caisse');
  await page.getByRole('button', { name: 'Clôturer' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Ce que vous avez compté (F CFA)').fill('10000');
  await drawer.getByRole('button', { name: 'Clôturer' }).click();
  await expect(
    page.getByText('10 000 F CFA comptés pour 10 500 F CFA attendus. Écart : − 500 F CFA'),
  ).toBeVisible();
  await expect(page.getByText('Aucune caisse ouverte')).toBeVisible();
  await shot(page, '21-till-closed');
  expect(await sideways(page)).toBe(0);
});
