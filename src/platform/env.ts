function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example).`);
  return value;
}

/** Read lazily: importing a module never fails at build time. */
export const env = {
  /** The application role: no BYPASSRLS. */
  get databaseUrl() {
    return required('DATABASE_URL');
  },
  /** The owner role: migrations, and the jobs' schema. */
  get ownerDatabaseUrl() {
    return required('OWNER_DATABASE_URL');
  },
  get publicUrl() {
    return required('PUBLIC_URL').replace(/\/$/, '');
  },
  get accountUrl() {
    return required('KETE_ACCOUNT_URL').replace(/\/$/, '');
  },
  get clientId() {
    return required('KETE_CLIENT_ID');
  },
  get clientSecret() {
    return required('KETE_CLIENT_SECRET');
  },
  get sessionSecret() {
    return required('SESSION_SECRET');
  },
  get operatorsOrganizationId(): string | null {
    return process.env.KETE_OPERATORS_ORGANIZATION_ID || null;
  },
  get mailFrom() {
    return process.env.MAIL_FROM ?? 'Kete <bonjour@kete.africa>';
  },
};
