import type { TagTone } from '@kete/design';
import * as m from '@/paraglide/messages.js';
import type { ExpenseCategory } from '../domain/charges';
import type { Confidence } from '../domain/costs';
import type { PaidFrom } from '../money.record';

// The words of the money, in the person's language.

export const categoryWords: Record<ExpenseCategory, () => string> = {
  rent: m.category_rent,
  wages: m.category_wages,
  electricity: m.category_electricity,
  water: m.category_water,
  detergent: m.category_detergent,
  packaging: m.category_packaging,
  maintenance: m.category_maintenance,
  depreciation: m.category_depreciation,
  transport: m.category_transport,
  telecom: m.category_telecom,
  taxes: m.category_taxes,
  other: m.category_other,
};

export const paidFromWords: Record<PaidFrom, () => string> = {
  till: m.paid_from_till,
  mobile_money: m.method_mobile_money,
  bank: m.paid_from_bank,
  other: m.paid_from_other,
};

/** How far a figure rests on measures taken at the laundry: said, never hidden. */
export const confidenceWords: Record<Confidence, () => string> = {
  measured: m.confidence_measured,
  estimated: m.confidence_estimated,
  partial: m.confidence_partial,
  never: m.confidence_never,
};

export const confidenceTones: Record<Confidence, TagTone> = {
  measured: 'validated',
  estimated: 'verify',
  partial: 'verify',
  never: 'neutral',
};
