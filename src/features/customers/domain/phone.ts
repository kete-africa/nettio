import { RuleError } from '@/lib/rule-error';

// A customer's phone is her business identifier (docs/product/model.md): written one way only,
// so that two customers never share one and she is found however her number was typed.

/**
 * A phone as Nettio keeps it: `+` and its digits. A local number takes the laundry's country
 * prefix; `00` reads as `+`. Refused when it cannot be a phone.
 */
export function normalizePhone(input: string, countryPrefix = '228'): string {
  const typed = input.trim();
  const digits = typed.replace(/\D/g, '');
  let full: string;
  if (typed.startsWith('+')) full = digits;
  else if (digits.startsWith('00')) full = digits.slice(2);
  else if (digits.startsWith(countryPrefix) && digits.length > 9) full = digits;
  else full = `${countryPrefix}${digits.replace(/^0+/, '')}`;
  if (full.length < 9 || full.length > 15) throw new RuleError('phone_invalid');
  return `+${full}`;
}

/** A phone as a screen shows it: +228 90 12 34 56. */
export function formatPhone(phone: string, countryPrefix = '228'): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith(countryPrefix) ? digits.slice(countryPrefix.length) : digits;
  const prefix = digits.startsWith(countryPrefix) ? `+${countryPrefix} ` : '+';
  return prefix + (local.match(/.{1,2}/g) ?? []).join(' ');
}
