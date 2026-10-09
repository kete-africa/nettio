import { expect, test } from '@playwright/test';
import { freshOrganization, shot, sideways, signIn } from './session';

// Specs/025-manager in a browser: a clerk takes over a shared device with her own code, asks for a
// discount she may not give; the manager grants it from her day; a complaint; the usual week.

const organizationId = freshOrganization('manager');
const afi = { userId: `usr_afi_${organizationId}`, name: 'Afi', organizationId, role: 'owner' as const };
const mawuli = { userId: `usr_mawuli_${organizationId}`, name: 'Mawuli', organizationId, role: 'member' as const };

test.describe.configure({ mode: 'serial' });

test('the owner sets up, receives a deposit, and allows the shared device', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/demarrage');
  await page.getByLabel('Nom du pressing').fill('Pressing Afi');
  await page.getByLabel('Nom du point').fill('Agoè');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page).toHaveURL(/\/pressing\/schema$/);
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

  // The manager's board: nothing waits; the rules are the laundry's, and none is proposed.
  await page.goto('/pressing/gerant');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gérant');
  await expect(page.getByText('Aucune demande en attente.')).toBeVisible();
  await expect(page.getByText('Aucune réclamation ouverte.')).toBeVisible();
  await expect(page.getByText('Aucun dépôt prêt depuis plus de 30 jours.')).toBeVisible();
  await expect(page.getByLabel('Frais de garde par jour ensuite (F CFA)')).toHaveValue('0');
  await page.getByLabel('Changer de personne sur un appareil partagé').check();
  await page.getByRole('button', { name: 'Enregistrer les règles' }).click();
  await expect(page.getByText('Règles enregistrées.')).toBeVisible();
  expect(await sideways(page)).toBe(0);

  // The clerk appears in the team by signing in once; the owner gives her a role.
  await signIn(context, mawuli);
  await page.goto('/aujourdhui');
  await expect(page.getByText('Vous n’avez pas encore de rôle')).toBeVisible();
  await signIn(context, afi);
  await page.goto('/pressing/equipe');
  await page.getByRole('button', { name: 'Mawuli' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Rôle').selectOption('counter');
  await drawer.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('cell', { name: 'Réception' })).toBeVisible();
});

test('each one chooses her own code; a simple one is refused', async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(context, mawuli);
  await page.goto('/aujourdhui');
  await page.getByRole('button', { name: 'Changer de personne' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Vous n’avez pas encore de code', { exact: false })).toBeVisible();
  await dialog.getByLabel('Mon code (6 chiffres)').fill('123456');
  await dialog.getByRole('button', { name: 'Enregistrer mon code' }).click();
  await expect(dialog.getByText('Ce code est trop simple à deviner.', { exact: false })).toBeVisible();
  await dialog.getByLabel('Mon code (6 chiffres)').fill('482913');
  await dialog.getByRole('button', { name: 'Enregistrer mon code' }).click();
  await expect(dialog.getByText('Code enregistré.', { exact: false })).toBeVisible();
  await expect(dialog.getByText('Vous avez un code.', { exact: false })).toBeVisible();
});

test('on the owner’s device, the clerk takes over with her code and asks for a discount', async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(context, afi);
  await page.goto('/aujourdhui');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' }).first();
  await expect(nav).toContainText('Équipe et droits');
  await page.getByRole('button', { name: 'Changer de personne' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Qui prend la main').selectOption({ label: 'Mawuli' });
  // A wrong code opens nothing.
  await dialog.getByLabel('Son code personnel').fill('482914');
  await dialog.getByRole('button', { name: 'Prendre la main' }).click();
  await expect(dialog.getByText('Ce n’est pas le bon code.', { exact: false })).toBeVisible();
  await dialog.getByLabel('Son code personnel').fill('482913');
  await dialog.getByRole('button', { name: 'Prendre la main' }).click();

  // The device is now hers: her name, her rights — not the owner's.
  await expect(page.getByText('Sur l’appareil de Afi')).toBeVisible();
  await expect(nav).not.toContainText('Équipe et droits');
  await expect(nav).not.toContainText('Résultat');
  await shot(page, '43-shared-device');
  await page.goto('/pressing/equipe');
  await expect(page.getByText('Vous n’avez pas le droit de faire cela.')).toBeVisible();

  // What she may not do alone, she asks for.
  await page.goto('/depots');
  await page.getByText('A-0001').first().click();
  await page.getByRole('button', { name: 'Demander une validation' }).click();
  await page.getByLabel('Montant (F CFA)').fill('500');
  await page.getByLabel('Pourquoi').fill('Cliente fidèle');
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(page.getByText('Demande envoyée.', { exact: false })).toBeVisible();
  // She reads her request; she cannot grant it.
  await page.goto('/pressing/gerant');
  await expect(page.getByText('Remise — 500 F CFA')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accorder' })).toHaveCount(0);

  // She hands the device back.
  await page.getByRole('button', { name: 'Changer de personne' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rendre la main à Afi' }).click();
  await expect(page).toHaveURL(/\/aujourdhui$/);
  await expect(nav).toContainText('Équipe et droits');
  await expect(page.getByText('Sur l’appareil de Afi')).toHaveCount(0);
});

test('the manager finds the request in her day and grants it; the deposit follows', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/aujourdhui');
  // Her day says what waits for her, and leads to her board.
  await expect(page.getByRole('link', { name: /1 demande\(s\) attendent votre décision/ })).toHaveAttribute(
    'href',
    '/pressing/gerant',
  );
  await page.goto('/pressing/gerant');
  await expect(page.getByText('Demandé par Mawuli', { exact: false })).toBeVisible();
  await shot(page, '44-manager');
  expect(await sideways(page)).toBe(0);
  await page.getByRole('button', { name: 'Accorder' }).click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Accorder' }).click();
  await expect(page.getByText('Accordé : c’est fait sur le dépôt A-0001.')).toBeVisible();
  await expect(page.getByText('Aucune demande en attente.')).toBeVisible();
  await page.goto('/depots');
  await page.getByText('A-0001').first().click();
  await expect(page.getByText('Remise accordée')).toBeVisible();
  await expect(page.getByText('Cliente fidèle').first()).toBeVisible();
  await expect(page.getByText('1 500 F CFA').first()).toBeVisible();
});

test('a complaint is opened on the deposit and closed by the manager; a week is planned', async ({ page, context }) => {
  await signIn(context, afi);
  await page.goto('/depots');
  await page.getByText('A-0001').first().click();
  await page.getByRole('button', { name: 'Ouvrir une réclamation' }).click();
  await page.getByLabel('De quoi s’agit-il').selectOption('stain');
  await page.getByLabel('Ce que dit le client').fill('Tache de vin restée sur une chemise');
  await page.getByRole('button', { name: 'Ouvrir la réclamation' }).click();
  await expect(page.getByText('Réclamation ouverte.', { exact: false })).toBeVisible();

  await page.goto('/aujourdhui');
  await expect(page.getByRole('link', { name: /1 réclamation\(s\) ouverte\(s\)/ })).toHaveAttribute(
    'href',
    '/pressing/gerant',
  );
  await page.goto('/pressing/gerant');
  await expect(page.getByText('Tache de vin restée sur une chemise')).toBeVisible();
  await page.getByRole('button', { name: 'Clore la réclamation' }).click();
  await page.getByLabel('Ce qui a été décidé').fill('Chemise relavée');
  await page.getByLabel('Dédommagement (F CFA)').fill('1000');
  await page.getByRole('button', { name: 'Clore la réclamation' }).click();
  await expect(page.getByText('Réclamation du dépôt A-0001 close.')).toBeVisible();
  await expect(page.getByText('Chemise relavée — 1 000 F CFA')).toBeVisible();

  // The usual week of a person: her days, her hours.
  await page.getByRole('button', { name: 'Modifier la semaine de Mawuli' }).click();
  await page.getByLabel('Lundi', { exact: true }).check();
  await page.getByLabel('Mardi', { exact: true }).check();
  await page.getByLabel('Arrivée (Mardi)').fill('08:00');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Semaine de Mawuli enregistrée.')).toBeVisible();
  await expect(page.getByText('Lundi 07:30–17:30 · Mardi 08:00–17:30')).toBeVisible();
  await shot(page, '45-schedule');
  expect(await sideways(page)).toBe(0);
});
