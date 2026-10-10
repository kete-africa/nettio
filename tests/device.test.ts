import { describe, expect, it } from 'vitest';
import { code128, code128Patterns, code128Values, modulesOf } from '../src/features/device/domain/barcode';
import {
  isNetworkFailure,
  parsePending,
  toRetry,
  withError,
  withoutPending,
  withPending,
  type PendingDeposit,
} from '../src/features/device/domain/pending';
import { weightIn } from '../src/features/device/domain/scale';

// This device's own equipment (specs/031-device): a label's bar code, what a scale says, and the
// deposits a counter keeps while the network is away. Pure rules: nothing here needs a device.

describe('a label’s bar code (Code 128, set B)', () => {
  it('its table is the standard’s: 107 distinct symbols, 11 modules each — the stop, 13', () => {
    expect(code128Patterns).toHaveLength(107);
    expect(new Set(code128Patterns).size).toBe(107);
    const widths = code128Patterns.map((pattern) => [...pattern].reduce((sum, digit) => sum + Number(digit), 0));
    expect(widths.slice(0, 106).every((width) => width === 11)).toBe(true);
    expect(widths[106]).toBe(13);
    // Every symbol starts with a bar and alternates: six widths, the stop seven.
    expect(code128Patterns.slice(0, 106).every((pattern) => pattern.length === 6)).toBe(true);
    expect(code128Patterns[106]).toHaveLength(7);
  });

  it('writes start, the characters, the check symbol and stop', () => {
    // The standard's worked example, « PJJ123C »: in set B its check symbol is 55.
    expect(code128Values('PJJ123C')).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
    // A deposit's number: 104 + 33·1 + 13·2 + 16·3 + 16·4 + 16·5 + 17·6 = 457 → 457 mod 103 = 45.
    expect(code128Values('A-0001')).toEqual([104, 33, 13, 16, 16, 16, 17, 45, 106]);
  });

  it('gives bars a scanner reads: alternating widths, a whole number of modules', () => {
    const bars = code128('A-0412') ?? [];
    // Start, six characters and the check symbol are 11 modules each; the stop is 13.
    expect(modulesOf(bars)).toBe(8 * 11 + 13);
    expect(bars).toHaveLength(8 * 6 + 7);
    expect(bars.every((width) => width >= 1 && width <= 4)).toBe(true);
    // The same number always gives the same bars; another number, other bars.
    expect(code128('A-0412')).toEqual(bars);
    expect(code128('A-0413')).not.toEqual(bars);
  });

  it('prints nothing rather than something unreadable', () => {
    expect(code128('')).toBeNull();
    expect(code128('Agoè-0001')).toBeNull();
    expect(code128('A'.repeat(41))).toBeNull();
    expect(code128('B-0042 / 3')).not.toBeNull();
  });
});

describe('what a scale says', () => {
  it('reads the last weight stated, in kilos, to the gram', () => {
    expect(weightIn('ST,GS,+   1.250kg\r\n')).toBe(1.25);
    expect(weightIn('US,GS,+ 0.900kg\r\nST,GS,+ 1.250kg\r\n')).toBe(1.25);
    expect(weightIn('1250 g')).toBe(1.25);
    expect(weightIn('0003.40')).toBe(3.4);
    expect(weightIn('W: 3,45 kg')).toBe(3.45);
    // The tare line that follows a weight is not the weight.
    expect(weightIn('W: 1.250 kg T: 0.000 kg')).toBe(1.25);
  });

  it('says nothing when no weight is there — never a guess', () => {
    expect(weightIn('')).toBeNull();
    expect(weightIn('ST,GS,ERR')).toBeNull();
    expect(weightIn('0.000 kg')).toBeNull();
    expect(weightIn('- 0.250 kg')).toBeNull();
    // Another unit than the laundry's is not converted by guesswork.
    expect(weightIn('2.5 lb')).toBeNull();
    // A scale never says half a ton of laundry: a stray number is not a weight.
    expect(weightIn('20261010')).toBeNull();
  });
});

describe('the deposits a counter keeps while the network is away', () => {
  const deposit = (key: string, over: Partial<PendingDeposit> = {}): PendingDeposit => ({
    key,
    order: { siteId: 'sit_1', lines: [] },
    customer: 'Mme Adjovi',
    total: 2_000,
    savedAt: '2026-10-10T09:00:00.000Z',
    ...over,
  });

  it('keeps each deposit once: the same key never waits twice', () => {
    const one = withPending([], deposit('dep-1'));
    expect(withPending(one, deposit('dep-1', { total: 9_999 }))).toEqual(one);
    expect(withPending(one, deposit('dep-2'))).toHaveLength(2);
    expect(withoutPending(withPending(one, deposit('dep-2')), 'dep-1').map((each) => each.key)).toEqual(['dep-2']);
  });

  it('one a rule refused waits for a person; the others are tried again', () => {
    const list = withError([deposit('dep-1'), deposit('dep-2')], 'dep-1', 'not_sold');
    expect(list[0]).toMatchObject({ key: 'dep-1', error: 'not_sold' });
    expect(toRetry(list).map((each) => each.key)).toEqual(['dep-2']);
  });

  it('keeps a deposit only when the network failed — never when Nettio answered', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'), true)).toBe(true);
    expect(isNetworkFailure(new Error('NetworkError when attempting to fetch resource.'), true)).toBe(true);
    expect(isNetworkFailure(new Error('Load failed'), true)).toBe(true);
    // The browser says it is offline: whatever failed, it did not reach Nettio.
    expect(isNetworkFailure(new Error('anything'), false)).toBe(true);
    expect(isNetworkFailure(new Error('500'), true)).toBe(false);
    expect(isNetworkFailure('not allowed', true)).toBe(false);
  });

  it('reads back only what is a list of deposits', () => {
    const stored = JSON.stringify([deposit('dep-1'), { key: 'broken' }, null, 'text']);
    expect(parsePending(stored).map((each) => each.key)).toEqual(['dep-1']);
    expect(parsePending(null)).toEqual([]);
    expect(parsePending('not json')).toEqual([]);
    expect(parsePending('{"key":"dep-1"}')).toEqual([]);
  });
});
