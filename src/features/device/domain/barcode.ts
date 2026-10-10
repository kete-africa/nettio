// A label's bar code (specs/031-device): Code 128, set B — what every scanner at a counter reads,
// and what « A-0412 » needs. Pure: a text in, the widths of its bars and spaces out.

/** The 107 symbols of Code 128, each as the widths of its bars and spaces (11 modules; the stop, 13). */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
] as const;

const START_B = 104;
const STOP = 106;

export const code128Patterns: readonly string[] = PATTERNS;

/** The symbols of a text in set B: start, one per character, the check symbol, stop. */
export function code128Values(text: string): number[] | null {
  if (text.length === 0 || text.length > 40) return null;
  const values: number[] = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    // Set B writes the printable ASCII characters, and nothing else.
    if (code < 32 || code > 126) return null;
    values.push(code - 32);
  }
  const sum = values.reduce((total, value, index) => total + value * (index + 1), START_B);
  return [START_B, ...values, sum % 103, STOP];
}

/**
 * The bars of a text: alternating bar and space widths in modules, starting with a bar. Null when
 * the text cannot be written in set B — nothing is printed rather than something unreadable.
 */
export function code128(text: string): number[] | null {
  const values = code128Values(text);
  if (!values) return null;
  return values.flatMap((value) => [...(PATTERNS[value] ?? '')].map(Number));
}

/** The width of a bar code in modules, quiet zones apart. */
export const modulesOf = (bars: number[]): number => bars.reduce((sum, width) => sum + width, 0);
