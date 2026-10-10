// What a counter's scale says (specs/031-device): a line of text on a serial port, in the
// manufacturer's own words. Pure: the text in, the weight in kilos out — or nothing, never a guess.

/**
 * The last weight a scale's output states, in kilos, to the gram. « ST,GS,+ 1.250kg »,
 * « 1250 g », « 0003.40 » — the last reading wins: scales repeat themselves until they settle.
 * Null when no weight is there, or when it is not above zero.
 */
export function weightIn(text: string): number | null {
  // A reading is a whole number as the scale wrote it: never a slice of a longer run of digits.
  const readings = [...text.matchAll(/([+-]?)\s*(?<![\d.])(\d{1,6}(?:[.,]\d{1,4})?)(?!\d|[.,]\d)\s*(kg|g|lb)?/gi)];
  for (const reading of readings.reverse()) {
    const [, sign = '', digits = '', unit = ''] = reading;
    if (unit.toLowerCase() === 'lb') continue;
    const value = Number(digits.replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    const kilos = unit.toLowerCase() === 'g' ? value / 1000 : value;
    if (sign === '-' || kilos <= 0 || kilos > 500) continue;
    return Math.round(kilos * 1000) / 1000;
  }
  return null;
}
