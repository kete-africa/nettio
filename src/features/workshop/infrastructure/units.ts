import { newId } from '@kete/records';
import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import type { IncidentKind, NewUnit, RouteStep } from '../domain/work';

// The workshop's tables and queries. This file imports nothing of the orders feature: the counter
// opens a deposit's units through it (`createUnits`) and asks whether work is left
// (`unfinishedUnits`), while the workshop's own commands — which do depend on orders — live beside.

/** The workshop's tables, each with its row-level security in the same migration. */
export function workshopMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  const secure = (table: string, grants: string) => `
${organizationPolicySql({ schema: s, table, appRole: options.appRole })}
grant ${grants} on ${s}.${table} to ${options.appRole};`;
  return `
create table ${s}.work_units (
  unit_id text primary key,
  organization_id text not null,
  order_id text not null references ${s}.orders (order_id),
  -- The site that processes it: the counter itself, or the plant it sends to.
  site_id text not null references ${s}.sites (site_id),
  service_id text not null,
  -- Its rank among the units of its deposit: the order they were entered in.
  seq integer not null default 0,
  label text not null,
  quantity numeric(10, 3) not null check (quantity > 0),
  -- The route of its service when the deposit was received: a later change never touches it.
  route jsonb not null,
  position integer not null default 0 check (position >= 0),
  rework integer not null default 0 check (rework >= 0),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index work_units_waiting on ${s}.work_units (organization_id, site_id) where finished_at is null;
create index work_units_by_order on ${s}.work_units (order_id);
${secure('work_units', 'select, insert, update')}

-- Every step validated, every rework: signed and dated. Appended, never changed.
create table ${s}.work_events (
  event_id text primary key,
  organization_id text not null,
  unit_id text not null references ${s}.work_units (unit_id),
  order_id text not null references ${s}.orders (order_id),
  kind text not null check (kind in ('step', 'rework')),
  step_id text not null,
  step_name text not null,
  actor_id text not null,
  actor_kind text not null,
  at timestamptz not null default now()
);
create index work_events_by_unit on ${s}.work_events (unit_id, at);
${secure('work_events', 'select, insert')}

create table ${s}.incidents (
  incident_id text primary key,
  organization_id text not null,
  unit_id text not null references ${s}.work_units (unit_id),
  order_id text not null references ${s}.orders (order_id),
  kind text not null check (kind in ('stain_left', 'damage', 'missing_piece', 'found_object', 'other')),
  note text not null default '',
  -- The step the unit was sent back to, when the incident asked for a rework.
  back_to_step text,
  created_by text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text not null default '',
  resolved_by text
);
create index incidents_open on ${s}.incidents (organization_id) where resolved_at is null;
${secure('incidents', 'select, insert, update')}
`;
}

/** Opens the work units of a deposit at the site that processes it. */
export async function createUnits(
  db: SqlExecutor,
  organizationId: string,
  input: { orderId: string; siteId: string; units: NewUnit[] },
): Promise<number> {
  if (input.units.length === 0) return 0;
  await db.query(
    `insert into work_units (unit_id, organization_id, order_id, site_id, service_id, label, quantity,
                             route, seq)
     select t.unit_id, $1, $2, $3, t.service_id, t.label, t.quantity, t.route::jsonb, t.seq::int
       from unnest($4::text[], $5::text[], $6::text[], $7::numeric[], $8::text[]) with ordinality
            as t (unit_id, service_id, label, quantity, route, seq)`,
    [
      organizationId,
      input.orderId,
      input.siteId,
      input.units.map(() => newId('wku')),
      input.units.map((unit) => unit.serviceId),
      input.units.map((unit) => unit.label),
      input.units.map((unit) => unit.quantity),
      input.units.map((unit) => JSON.stringify(unit.route)),
    ],
  );
  return input.units.length;
}

/** How many units of a deposit have not finished their route. */
export async function unfinishedUnits(db: SqlExecutor, orderId: string): Promise<number> {
  const { rows } = await db.query<{ left: string }>(
    `select count(*) as left from work_units where order_id = $1 and finished_at is null`,
    [orderId],
  );
  return Number(rows[0]?.left ?? 0);
}

export interface WorkUnit {
  unitId: string;
  orderId: string;
  siteId: string;
  serviceId: string;
  label: string;
  quantity: number;
  route: RouteStep[];
  position: number;
  rework: number;
  finishedAt: Date | null;
}

type UnitRow = {
  unit_id: string;
  order_id: string;
  site_id: string;
  service_id: string;
  label: string;
  quantity: string;
  route: RouteStep[];
  position: number;
  rework: number;
  finished_at: Date | null;
};

const unitColumns = `u.unit_id, u.order_id, u.site_id, u.service_id, u.label, u.quantity, u.route,
  u.position, u.rework, u.finished_at`;

const toUnit = (row: UnitRow): WorkUnit => ({
  unitId: row.unit_id,
  orderId: row.order_id,
  siteId: row.site_id,
  serviceId: row.service_id,
  label: row.label,
  quantity: Number(row.quantity),
  route: row.route,
  position: row.position,
  rework: row.rework,
  finishedAt: row.finished_at,
});

/** A unit as a gesture needs it: locked, so that two people never validate the same step. */
export async function lockUnit(db: SqlExecutor, unitId: string): Promise<WorkUnit | null> {
  const { rows } = await db.query<UnitRow>(
    `select ${unitColumns} from work_units u where u.unit_id = $1 for update`,
    [unitId],
  );
  return rows[0] ? toUnit(rows[0]) : null;
}

export async function unitsOfOrder(db: SqlExecutor, orderId: string): Promise<WorkUnit[]> {
  const { rows } = await db.query<UnitRow>(
    `select ${unitColumns} from work_units u where u.order_id = $1 order by u.seq, u.unit_id`,
    [orderId],
  );
  return rows.map(toUnit);
}

export async function moveUnit(
  db: SqlExecutor,
  unit: { unitId: string; position: number; finished: boolean; reworked?: boolean },
): Promise<void> {
  await db.query(
    `update work_units set position = $2,
            finished_at = case when $3 then now() else null end,
            rework = rework + case when $4 then 1 else 0 end
      where unit_id = $1`,
    [unit.unitId, unit.position, unit.finished, unit.reworked ?? false],
  );
}

export async function noteWork(
  db: SqlExecutor,
  organizationId: string,
  event: {
    unitId: string;
    orderId: string;
    kind: 'step' | 'rework';
    step: RouteStep;
    actor: { id: string; kind: string };
  },
): Promise<void> {
  await db.query(
    `insert into work_events (event_id, organization_id, unit_id, order_id, kind, step_id, step_name,
                              actor_id, actor_kind)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      newId('wev'),
      organizationId,
      event.unitId,
      event.orderId,
      event.kind,
      event.step.stepId,
      event.step.name,
      event.actor.id,
      event.actor.kind,
    ],
  );
}

/** A unit in the queue, with what its worker needs to know of its deposit. */
export interface QueuedUnit extends WorkUnit {
  number: string;
  promisedAt: Date;
  express: boolean;
  late: boolean;
}

/** What waits in the workshop of a site (or of all), the soonest promised first. */
export async function waitingUnits(
  db: SqlExecutor,
  query: { siteId?: string | undefined },
): Promise<QueuedUnit[]> {
  const { rows } = await db.query<
    UnitRow & { number: string; promised_at: Date; express: boolean; late: boolean }
  >(
    `select ${unitColumns}, o.number, o.promised_at, o.express, o.promised_at < now() as late
       from work_units u join orders o using (order_id)
      where u.finished_at is null
        and o.status in ('received', 'in_progress', 'ready')
        and ($1::text is null or u.site_id = $1)
      order by o.promised_at, o.number, u.seq, u.unit_id`,
    [query.siteId ?? null],
  );
  return rows.map((row) => ({
    ...toUnit(row),
    number: row.number,
    promisedAt: row.promised_at,
    express: row.express,
    late: row.late,
  }));
}

export interface Incident {
  incidentId: string;
  unitId: string;
  orderId: string;
  number: string;
  label: string;
  kind: IncidentKind;
  note: string;
  backToStep: string | null;
  createdBy: string;
  createdAt: Date;
  resolvedAt: Date | null;
  resolution: string;
}

type IncidentRow = {
  incident_id: string;
  unit_id: string;
  order_id: string;
  number: string;
  label: string;
  kind: IncidentKind;
  note: string;
  back_to_step: string | null;
  created_by: string;
  created_at: Date;
  resolved_at: Date | null;
  resolution: string;
};

const toIncident = (row: IncidentRow): Incident => ({
  incidentId: row.incident_id,
  unitId: row.unit_id,
  orderId: row.order_id,
  number: row.number,
  label: row.label,
  kind: row.kind,
  note: row.note,
  backToStep: row.back_to_step,
  createdBy: row.created_by,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at,
  resolution: row.resolution,
});

/** Incidents: the open ones, or those of one deposit. */
export async function listIncidents(
  db: SqlExecutor,
  query: { orderId?: string | undefined; openOnly: boolean },
): Promise<Incident[]> {
  const { rows } = await db.query<IncidentRow>(
    `select i.incident_id, i.unit_id, i.order_id, o.number, u.label, i.kind, i.note, i.back_to_step,
            i.created_by, i.created_at, i.resolved_at, i.resolution
       from incidents i join orders o using (order_id) join work_units u using (unit_id)
      where ($1::text is null or i.order_id = $1) and (not $2 or i.resolved_at is null)
      order by i.created_at desc limit 200`,
    [query.orderId ?? null, query.openOnly],
  );
  return rows.map(toIncident);
}

export async function insertIncident(
  db: SqlExecutor,
  organizationId: string,
  incident: {
    unitId: string;
    orderId: string;
    kind: IncidentKind;
    note: string;
    backToStep: string | null;
    createdBy: string;
  },
): Promise<string> {
  const incidentId = newId('inc');
  await db.query(
    `insert into incidents (incident_id, organization_id, unit_id, order_id, kind, note, back_to_step, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      incidentId,
      organizationId,
      incident.unitId,
      incident.orderId,
      incident.kind,
      incident.note,
      incident.backToStep,
      incident.createdBy,
    ],
  );
  return incidentId;
}

export async function resolveIncident(
  db: SqlExecutor,
  input: { incidentId: string; resolution: string; resolvedBy: string },
): Promise<boolean> {
  const { rows } = await db.query(
    `update incidents set resolved_at = now(), resolution = $2, resolved_by = $3
      where incident_id = $1 and resolved_at is null returning incident_id`,
    [input.incidentId, input.resolution, input.resolvedBy],
  );
  return rows.length > 0;
}
