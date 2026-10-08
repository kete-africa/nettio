import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { KeteIdentity } from '@kete/auth';
import { chromium } from '@playwright/test';
import { SignJWT } from 'jose';

// `pnpm demo` — Nettio on this machine, signed in, with a small laundry already set up, so that
// it can be tried without the Compte Kete: the same production build as the browser tests, on the
// Neon "test" branch, in its own organization (`org_demo`). The session is signed with a secret
// made for this run only. `pnpm demo -- --as cashier` opens it as another role
// (manager, counter, cashier, workshop, accountant); `--fresh` skips the build when one exists.

const root = fileURLToPath(new URL('..', import.meta.url));
const localEnv = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

const PORT = 3403;
const ORGANIZATION = 'org_demo';
const roles = ['owner', 'manager', 'counter', 'cashier', 'workshop', 'accountant'] as const;
type Role = (typeof roles)[number];
const asked = process.argv[process.argv.indexOf('--as') + 1] as Role | undefined;
const role: Role = process.argv.includes('--as') && asked && roles.includes(asked) ? asked : 'owner';

for (const name of ['KETE_TEST_APP_URL', 'KETE_TEST_OWNER_URL']) {
  if (!process.env[name]) throw new Error(`${name} must be set (see .env.example).`);
}
const sessionSecret = randomBytes(32).toString('hex');
Object.assign(process.env, {
  DATABASE_URL: process.env.KETE_TEST_APP_URL,
  OWNER_DATABASE_URL: process.env.KETE_TEST_OWNER_URL,
  PUBLIC_URL: `http://localhost:${PORT}`,
  // No Compte Kete here: the demo signs its own session, for this run only.
  KETE_ACCOUNT_URL: 'http://localhost:9',
  KETE_CLIENT_ID: 'demo',
  KETE_CLIENT_SECRET: 'demo',
  SESSION_SECRET: sessionSecret,
  ENTERPRISE_API_URL: '',
});

const say = (text: string) => console.log(`[demo] ${text}`);
function run(command: string): void {
  const done = spawnSync(command, { cwd: root, shell: true, stdio: 'inherit', env: process.env });
  if (done.status !== 0) throw new Error(`${command} failed.`);
}

const person = (userId: string, name: string, kind: KeteIdentity['role']): KeteIdentity => ({
  userId,
  email: `${userId}@example.test`,
  name,
  organizationId: ORGANIZATION,
  role: kind,
  apps: {},
  twoFactor: false,
  expiresAt: new Date(Date.now() + 3_600_000),
});
const afi = person('usr_demo_afi', 'Afi', 'owner');
const people: Record<Exclude<Role, 'owner'>, KeteIdentity> = {
  manager: person('usr_demo_kossi', 'Kossi', 'member'),
  counter: person('usr_demo_mawuli', 'Mawuli', 'member'),
  cashier: person('usr_demo_essi', 'Essi', 'member'),
  workshop: person('usr_demo_yao', 'Yao', 'member'),
  accountant: person('usr_demo_lawson', 'Mme Lawson', 'member'),
};

/** Sets up « Pressing Démo » once: prices, packs, cost sheets, charges, a till, a few deposits. */
async function seed(): Promise<void> {
  const { registry } = await import('@/platform/registry');
  const { asPerson } = await import('@/platform/rights');
  const { transaction } = await import('@/platform/db');
  const { screenActor } = await import('@/platform/session');
  const { notePresence } = await import('@/features/business/infrastructure/business.tables');
  const { defaultTemplates } = await import('@/features/messaging/reply-words');

  const act = async <T = Record<string, unknown>>(who: KeteIdentity, name: string, input: unknown) => {
    const result = await asPerson(who, () =>
      registry.invoke({
        actor: screenActor(who),
        organizationId: ORGANIZATION,
        name,
        input,
        confirmed: true,
      }),
    );
    if (result.status !== 'done') throw new Error(`${name}: ${JSON.stringify(result)}`);
    return result.output as T;
  };

  // Everyone of the team appears, with a role: the owner by her Compte Kete role, the others here.
  await transaction(ORGANIZATION, async (db) => {
    await notePresence(db, ORGANIZATION, { userId: afi.userId, name: afi.name, role: 'owner' });
    for (const [staffRole, who] of Object.entries(people)) {
      await notePresence(db, ORGANIZATION, {
        userId: who.userId,
        name: who.name,
        role: staffRole as Exclude<Role, 'owner'>,
      });
    }
  });

  const overview = await act<{ settings: object | null; sites: { siteId: string }[] }>(
    afi,
    'business_overview',
    {},
  );
  if (overview.settings) {
    say('« Pressing Démo » existe déjà : rien n’est recréé.');
    return;
  }
  say('Création de « Pressing Démo » (une minute)…');
  await act(afi, 'business_set_up', {
    businessName: 'Pressing Démo',
    profile: 'established',
    staffing: 'team',
    siteName: 'Agoè',
    siteCode: 'A',
  });
  const siteId = (await act<{ sites: { siteId: string }[] }>(afi, 'business_overview', {})).sites[0]
    ?.siteId;
  type Named = { name: string };
  const catalog = await act<{
    services: (Named & { serviceId: string })[];
    articles: (Named & { articleId: string })[];
  }>(afi, 'catalog_read', {});
  const service = (name: string) => catalog.services.find((s) => s.name === name)?.serviceId;
  const article = (name: string) => catalog.articles.find((a) => a.name === name)?.articleId;
  const wash = service('Lavage et repassage');
  const iron = service('Repassage seul');
  const kilo = service('Linge au kilo');

  for (const [name, amount] of [['Chemise', 500], ['Pantalon', 600], ['Veste', 1500], ['Costume', 2500], ['Robe', 1500]] as const) {
    await act(afi, 'catalog_set_price', { serviceId: wash, articleId: article(name), amount });
  }
  for (const name of ['Chemise', 'Pantalon']) {
    await act(afi, 'catalog_set_price', { serviceId: iron, articleId: article(name), amount: 300 });
  }
  await act(afi, 'catalog_set_price', { serviceId: kilo, articleId: null, amount: 600 });
  const business = await act<{ packId: string }>(afi, 'catalog_save_pack', {
    name: 'Business 12 pièces',
    mode: 'pieces',
    quota: 12,
    price: 6000,
  });
  const family = await act<{ packId: string }>(afi, 'catalog_save_pack', {
    name: 'Famille 10 kg',
    mode: 'weight',
    quota: 10,
    price: 5000,
  });

  // Cost sheets: some measured, one estimated, the jacket never measured — on purpose.
  for (const [name, laborMinutes, consumablesCost, machineCost, measured] of [
    ['Chemise', 6, 120, 40, true],
    ['Pantalon', 7, 130, 40, true],
    ['Costume', 24, 300, 100, false],
  ] as const) {
    await act(afi, 'costs_save_sheet', {
      serviceId: wash,
      articleId: article(name),
      laborMinutes,
      consumablesCost,
      machineCost,
      measured,
    });
  }
  await act(afi, 'costs_save_sheet', {
    serviceId: kilo,
    articleId: null,
    laborMinutes: 10,
    consumablesCost: 200,
    machineCost: 150,
    measured: true,
  });

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  for (const [label, category, amount] of [['Loyer', 'rent', 150_000], ['Salaires', 'wages', 180_000]] as const) {
    await act(afi, 'expenses_record', {
      spentOn: monthStart,
      label,
      category,
      behavior: 'fixed',
      amount,
      paidFrom: 'bank',
      recurring: true,
    });
  }
  await act(afi, 'expenses_record', {
    spentOn: today,
    label: 'Lessive et assouplissant',
    category: 'detergent',
    behavior: 'variable',
    amount: 25_000,
    paidFrom: 'mobile_money',
  });

  const words = defaultTemplates('fr');
  await act(afi, 'messages_set_template', { kind: 'receipt', enabled: true, body: words.receipt });
  await act(afi, 'messages_set_template', { kind: 'ready', enabled: true, body: words.ready });

  await act(afi, 'cash_open', { siteId, openingFloat: 10_000 });
  const first = await act<{ orderId: string }>(afi, 'orders_receive', {
    siteId,
    phone: '90 12 34 56',
    customerName: 'Mme Adjovi',
    lines: [
      { serviceId: wash, articleId: article('Chemise'), quantity: 4 },
      { serviceId: wash, articleId: article('Pantalon'), quantity: 2 },
    ],
    packId: business.packId,
    payment: { amount: 3000, method: 'mobile_money' },
  });
  await act(afi, 'orders_receive', {
    siteId,
    phone: '91 22 33 44',
    customerName: 'M. Kpodar',
    lines: [
      { serviceId: wash, articleId: article('Costume'), quantity: 2 },
      { serviceId: wash, articleId: article('Chemise'), quantity: 3, defects: 'tache au col' },
    ],
    payment: { amount: 4000, method: 'cash' },
  });
  await act(afi, 'orders_receive', {
    siteId,
    phone: '92 55 66 77',
    customerName: 'Mme Lawson',
    lines: [{ serviceId: kilo, articleId: null, quantity: 6.5 }],
    packId: family.packId,
  });
  await act(afi, 'orders_receive', {
    siteId,
    phone: '93 10 20 30',
    customerName: 'M. Agbeko',
    lines: [{ serviceId: wash, articleId: article('Veste'), quantity: 1 }],
    express: true,
  });
  // The first deposit goes through the whole workshop: it is ready, and waits for its customer.
  const { units } = await act<{ units: { unitId: string; route: unknown[] }[] }>(
    afi,
    'workshop_order',
    { orderId: first.orderId },
  );
  for (const unit of units) {
    for (let step = 0; step < unit.route.length; step++) {
      await act(afi, 'workshop_advance', { unitId: unit.unitId });
    }
  }
  await act(afi, 'draws_record', { drawnOn: today, amount: 20_000, paidFrom: 'mobile_money' });
  say('« Pressing Démo » est prêt.');
}

const who = role === 'owner' ? afi : people[role];

// The build first: it generates the messages the app's code imports (a fresh clone has none).
if (!process.argv.includes('--fresh') || !existsSync(`${root}dist/server/server.js`)) {
  say('Construction de l’app…');
  run('pnpm build');
}
say('Migrations sur la branche de test…');
run('pnpm db:migrate');
await seed();

say(`Démarrage sur http://localhost:${PORT}…`);
const server = spawn(
  `pnpm exec srvx serve --entry dist/server/server.js --static "${root}dist/client" --prod --port ${PORT}`,
  { cwd: root, shell: true, stdio: 'ignore', env: process.env },
);
const stop = () => {
  // On Windows the shell's child must be stopped with its tree.
  if (process.platform === 'win32' && server.pid) {
    spawnSync(`taskkill /pid ${server.pid} /T /F`, { shell: true, stdio: 'ignore' });
  } else {
    server.kill();
  }
};
process.on('exit', stop);
for (let attempt = 0; attempt < 60; attempt++) {
  const up = await fetch(`http://localhost:${PORT}/health`).then((r) => r.ok).catch(() => false);
  if (up) break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const session = await new SignJWT({
  email: who.email,
  name: who.name,
  org: ORGANIZATION,
  role: who.role,
  apps: {},
  two_factor: false,
})
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(who.userId)
  .setIssuedAt()
  .setExpirationTime('8h')
  .sign(new TextEncoder().encode(sessionSecret));

// --check: no window — open the day, keep a picture, and stop (how this script is itself verified).
const check = process.argv.includes('--check');
const browser = await chromium.launch({
  headless: check,
  ...(process.env.KETE_CHROMIUM ? { executablePath: process.env.KETE_CHROMIUM } : {}),
});
const context = await browser.newContext({
  ...(check ? { viewport: { width: 1280, height: 900 } } : { viewport: null }),
  locale: 'fr-FR',
});
await context.addCookies([
  { name: 'kete_session', value: session, url: `http://localhost:${PORT}` },
  { name: 'kete_locale', value: 'fr', url: `http://localhost:${PORT}` },
]);
const page = await context.newPage();
await page.goto(`http://localhost:${PORT}/aujourdhui`);
if (check) {
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.screenshot({ path: process.env.NETTIO_DEMO_SHOT ?? 'demo.png', fullPage: true });
  say(`Vérifié : ${await page.getByRole('heading', { level: 1 }).textContent()} — ${page.url()}`);
  await browser.close();
  stop();
  process.exit(0);
}
say(`Ouvert en tant que ${who.name} (${role}). Fermez la fenêtre du navigateur pour arrêter.`);
await new Promise<void>((resolve) => browser.on('disconnected', () => resolve()));
stop();
process.exit(0);
