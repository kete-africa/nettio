import { z } from 'zod';

// The business as its owner sets it (docs/product/model.md): the settings, the sites, the team.
// One schema per gesture's input: the form, the server's validation and the MCP tool share it.

export const profiles = ['starting', 'established', 'multi_site'] as const;
export type Profile = (typeof profiles)[number];

export const staffings = ['solo', 'team'] as const;
export type Staffing = (typeof staffings)[number];

export const trackings = ['bag', 'piece'] as const;
export type Tracking = (typeof trackings)[number];

export const siteKinds = ['counter', 'plant', 'counter_plant'] as const;
export type SiteKind = (typeof siteKinds)[number];

/** The business roles a person holds in the laundry; the owner ticks what each may do. */
export const businessRoles = [
  'owner',
  'manager',
  'counter',
  'cashier',
  'workshop',
  'courier',
  'accountant',
] as const;
export type BusinessRole = (typeof businessRoles)[number];

const id = z.string().min(1).max(64);

export const setUpInput = z.object({
  businessName: z.string().trim().min(1).max(120),
  profile: z.enum(profiles),
  staffing: z.enum(staffings),
  /** The first site that receives deposits. */
  siteName: z.string().trim().min(1).max(80),
  siteCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,3}$/),
  /** The language the starter catalogue is written in. */
  locale: z.enum(['fr', 'en']).default('fr'),
});

export const settingsInput = z.object({
  businessName: z.string().trim().min(1).max(120),
  staffing: z.enum(staffings),
  tracking: z.enum(trackings),
  promisedHours: z.number().int().min(1).max(720),
  expressHours: z.number().int().min(1).max(720),
  expressPercent: z.number().int().min(0).max(300),
  discountCeilingPercent: z.number().int().min(0).max(100),
  workingDays: z.number().int().min(1).max(31),
  laborIsVariable: z.boolean(),
  laborMinuteCost: z.number().min(0).max(100_000),
  dormantDays: z.number().int().min(1).max(365),
});

export const siteInput = z.object({
  siteId: id.optional(),
  name: z.string().trim().min(1).max(80),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,3}$/),
  kind: z.enum(siteKinds),
  /** For a counter: the site that processes what it receives. */
  plantSiteId: id.nullable().default(null),
  active: z.boolean().default(true),
});

export const staffRoleInput = z.object({
  staffId: id,
  role: z.enum(businessRoles).nullable(),
  /** The sites she works at; none named means all of them. */
  siteIds: z.array(id).max(50).default([]),
  active: z.boolean().default(true),
});

export const rolePermissionsInput = z.object({
  role: z.enum(businessRoles),
  permissions: z.array(z.string().regex(/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/)).max(100),
});

export interface Settings {
  businessName: string;
  profile: Profile;
  staffing: Staffing;
  tracking: Tracking;
  currency: string;
  promisedHours: number;
  expressHours: number;
  expressPercent: number;
  discountCeilingPercent: number;
  workingDays: number;
  laborIsVariable: boolean;
  laborMinuteCost: number;
  dormantDays: number;
}

export interface Site {
  siteId: string;
  name: string;
  code: string;
  kind: SiteKind;
  plantSiteId: string | null;
  active: boolean;
}

export interface StaffMember {
  staffId: string;
  userId: string;
  name: string;
  /** Null while she waits for the owner to give her a role. */
  role: BusinessRole | null;
  siteIds: string[];
  active: boolean;
}
