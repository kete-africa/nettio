import { newId } from '@kete/records';
import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import {
  businessRoles,
  type BusinessRole,
  type Profile,
  type Settings,
  type Site,
  type SiteKind,
  type StaffMember,
  type Staffing,
  type Tracking,
} from '../business.record';

const roleList = businessRoles.map((role) => `'${role}'`).join(', ');

/** The business' tables, each with its row-level security in the same migration. */
export function businessMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  const secure = (table: string, grants: string) => `
${organizationPolicySql({ schema: s, table, appRole: options.appRole })}
grant ${grants} on ${s}.${table} to ${options.appRole};`;
  return `
create table ${s}.settings (
  organization_id text primary key,
  business_name text not null check (length(business_name) between 1 and 120),
  profile text not null check (profile in ('starting', 'established', 'multi_site')),
  staffing text not null check (staffing in ('solo', 'team')),
  tracking text not null default 'bag' check (tracking in ('bag', 'piece')),
  currency text not null default 'XOF',
  promised_hours integer not null default 48 check (promised_hours between 1 and 720),
  express_hours integer not null default 24 check (express_hours between 1 and 720),
  express_percent integer not null default 0 check (express_percent between 0 and 300),
  discount_ceiling_percent integer not null default 10
    check (discount_ceiling_percent between 0 and 100),
  working_days integer not null default 26 check (working_days between 1 and 31),
  labor_is_variable boolean not null default false,
  labor_minute_cost numeric(12, 2) not null default 0 check (labor_minute_cost >= 0),
  dormant_days integer not null default 30 check (dormant_days between 1 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
${secure('settings', 'select, insert, update')}

create table ${s}.sites (
  site_id text primary key,
  organization_id text not null,
  name text not null check (length(name) between 1 and 80),
  code text not null check (code ~ '^[A-Z]{1,3}$'),
  kind text not null check (kind in ('counter', 'plant', 'counter_plant')),
  plant_site_id text references ${s}.sites (site_id),
  active boolean not null default true,
  -- The next number of a deposit received here: its own series, never skipped.
  next_order_seq integer not null default 1 check (next_order_seq >= 1),
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);
${secure('sites', 'select, insert, update')}

create table ${s}.staff (
  staff_id text primary key,
  organization_id text not null,
  user_id text not null,
  -- The name shown at her last sign-in: all Nettio keeps of her profile.
  name text not null,
  role text check (role in (${roleList})),
  site_ids text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
${secure('staff', 'select, insert, update')}

create table ${s}.role_permissions (
  organization_id text not null,
  role text not null check (role in (${roleList})),
  permission text not null,
  -- What the owner decided for this role; a permission he never touched keeps its default.
  granted boolean not null,
  primary key (organization_id, role, permission)
);
${secure('role_permissions', 'select, insert, update')}
`;
}

type SettingsRow = {
  business_name: string;
  profile: Profile;
  staffing: Staffing;
  tracking: Tracking;
  currency: string;
  promised_hours: number;
  express_hours: number;
  express_percent: number;
  discount_ceiling_percent: number;
  working_days: number;
  labor_is_variable: boolean;
  labor_minute_cost: string;
  dormant_days: number;
};

/** The settings of the organization, or null while the business is not set up. */
export async function readSettings(db: SqlExecutor): Promise<Settings | null> {
  const { rows } = await db.query<SettingsRow>(
    `select business_name, profile, staffing, tracking, currency, promised_hours, express_hours,
            express_percent, discount_ceiling_percent, working_days, labor_is_variable,
            labor_minute_cost, dormant_days
       from settings`,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    businessName: row.business_name,
    profile: row.profile,
    staffing: row.staffing,
    tracking: row.tracking,
    currency: row.currency,
    promisedHours: row.promised_hours,
    expressHours: row.express_hours,
    expressPercent: row.express_percent,
    discountCeilingPercent: row.discount_ceiling_percent,
    workingDays: row.working_days,
    laborIsVariable: row.labor_is_variable,
    laborMinuteCost: Number(row.labor_minute_cost),
    dormantDays: row.dormant_days,
  };
}

export async function insertSettings(
  db: SqlExecutor,
  organizationId: string,
  settings: Pick<Settings, 'businessName' | 'profile' | 'staffing'>,
): Promise<void> {
  await db.query(
    `insert into settings (organization_id, business_name, profile, staffing)
     values ($1, $2, $3, $4)`,
    [organizationId, settings.businessName, settings.profile, settings.staffing],
  );
}

export async function updateSettings(
  db: SqlExecutor,
  settings: Omit<Settings, 'profile' | 'currency'>,
): Promise<void> {
  await db.query(
    `update settings set business_name = $1, staffing = $2, tracking = $3, promised_hours = $4,
            express_hours = $5, express_percent = $6, discount_ceiling_percent = $7,
            working_days = $8, labor_is_variable = $9, labor_minute_cost = $10, dormant_days = $11,
            updated_at = now()`,
    [
      settings.businessName,
      settings.staffing,
      settings.tracking,
      settings.promisedHours,
      settings.expressHours,
      settings.expressPercent,
      settings.discountCeilingPercent,
      settings.workingDays,
      settings.laborIsVariable,
      settings.laborMinuteCost,
      settings.dormantDays,
    ],
  );
}

type SiteRow = {
  site_id: string;
  name: string;
  code: string;
  kind: SiteKind;
  plant_site_id: string | null;
  active: boolean;
};

const toSite = (row: SiteRow): Site => ({
  siteId: row.site_id,
  name: row.name,
  code: row.code,
  kind: row.kind,
  plantSiteId: row.plant_site_id,
  active: row.active,
});

export async function listSites(db: SqlExecutor): Promise<Site[]> {
  const { rows } = await db.query<SiteRow>(
    `select site_id, name, code, kind, plant_site_id, active from sites order by created_at, code`,
  );
  return rows.map(toSite);
}

export async function saveSite(
  db: SqlExecutor,
  organizationId: string,
  site: Omit<Site, 'siteId'> & { siteId?: string | undefined },
): Promise<string> {
  if (site.siteId) {
    const { rows } = await db.query(
      `update sites set name = $2, code = $3, kind = $4, plant_site_id = $5, active = $6
        where site_id = $1 returning site_id`,
      [site.siteId, site.name, site.code, site.kind, site.plantSiteId, site.active],
    );
    return rows.length > 0 ? site.siteId : '';
  }
  const siteId = newId('sit');
  await db.query(
    `insert into sites (site_id, organization_id, name, code, kind, plant_site_id, active)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [siteId, organizationId, site.name, site.code, site.kind, site.plantSiteId, site.active],
  );
  return siteId;
}

type StaffRow = {
  staff_id: string;
  user_id: string;
  name: string;
  role: BusinessRole | null;
  site_ids: string[];
  active: boolean;
};

const toStaff = (row: StaffRow): StaffMember => ({
  staffId: row.staff_id,
  userId: row.user_id,
  name: row.name,
  role: row.role,
  siteIds: row.site_ids,
  active: row.active,
});

const staffColumns = `staff_id, user_id, name, role, site_ids, active`;

export async function listStaff(db: SqlExecutor): Promise<StaffMember[]> {
  const { rows } = await db.query<StaffRow>(
    `select ${staffColumns} from staff order by role is null desc, name`,
  );
  return rows.map(toStaff);
}

export async function findStaffOf(db: SqlExecutor, userId: string): Promise<StaffMember | null> {
  const { rows } = await db.query<StaffRow>(
    `select ${staffColumns} from staff where user_id = $1`,
    [userId],
  );
  return rows[0] ? toStaff(rows[0]) : null;
}

/**
 * Notes that a person of the organization signed in: she appears in the team, waiting for a role
 * unless `role` is given (the owner of the Compte Kete organization is owner here at once).
 */
export async function notePresence(
  db: SqlExecutor,
  organizationId: string,
  person: { userId: string; name: string; role: BusinessRole | null },
): Promise<void> {
  await db.query(
    `insert into staff (staff_id, organization_id, user_id, name, role)
     values ($1, $2, $3, $4, $5)
     on conflict (organization_id, user_id) do update
       set name = excluded.name, role = coalesce(staff.role, excluded.role)`,
    [newId('stf'), organizationId, person.userId, person.name, person.role],
  );
}

export async function setStaffRole(
  db: SqlExecutor,
  staff: { staffId: string; role: BusinessRole | null; siteIds: string[]; active: boolean },
): Promise<boolean> {
  const { rows } = await db.query(
      `update staff set role = $2, site_ids = $3, active = $4 where staff_id = $1 returning staff_id`,
    [staff.staffId, staff.role, staff.siteIds, staff.active],
  );
  return rows.length > 0;
}

/** What the owner decided, role by role: a permission ticked (true) or unticked (false). */
export async function readRolePermissions(
  db: SqlExecutor,
): Promise<Map<BusinessRole, Map<string, boolean>>> {
  const { rows } = await db.query<{ role: BusinessRole; permission: string; granted: boolean }>(
    `select role, permission, granted from role_permissions`,
  );
  const decided = new Map<BusinessRole, Map<string, boolean>>();
  for (const row of rows) {
    if (!decided.has(row.role)) decided.set(row.role, new Map());
    decided.get(row.role)?.set(row.permission, row.granted);
  }
  return decided;
}

export async function writeRolePermissions(
  db: SqlExecutor,
  organizationId: string,
  role: BusinessRole,
  decided: Map<string, boolean>,
): Promise<void> {
  for (const [permission, granted] of decided) {
    await db.query(
      `insert into role_permissions (organization_id, role, permission, granted)
       values ($1, $2, $3, $4)
       on conflict (organization_id, role, permission) do update set granted = excluded.granted`,
      [organizationId, role, permission, granted],
    );
  }
}
