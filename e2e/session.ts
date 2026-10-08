import { randomBytes } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';
import { SignJWT } from 'jose';
import { PORT, SESSION_SECRET } from '../playwright.config';

export const BASE = `http://localhost:${PORT}`;

/** A fresh organization per run: the "test" branch keeps what earlier runs left. */
export const freshOrganization = (name: string): string =>
  `org_e2e_${name}_${randomBytes(3).toString('hex')}`;

/**
 * Signs a person in the way the app's own callback does: a session cookie signed with the test
 * session secret. The e2e server knows no other secret, and no Compte Kete.
 */
export async function signIn(
  context: BrowserContext,
  who: { userId: string; name: string; organizationId: string; role: 'owner' | 'member' },
  locale: 'fr' | 'en' = 'fr',
): Promise<void> {
  const session = await new SignJWT({
    email: `${who.userId}@example.test`,
    name: who.name,
    org: who.organizationId,
    role: who.role,
    apps: {},
    two_factor: false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(who.userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SESSION_SECRET));
  await context.clearCookies();
  await context.addCookies([
    { name: 'kete_session', value: session, url: BASE },
    { name: 'kete_locale', value: locale, url: BASE },
  ]);
}

const shots = process.env.NETTIO_SCREENSHOTS;

/** Keeps a picture of the screen when NETTIO_SCREENSHOTS names a folder. */
export async function shot(page: Page, name: string): Promise<void> {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

/** A page never scrolls sideways on a phone. */
export async function sideways(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}
