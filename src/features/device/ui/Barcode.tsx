import { code128, modulesOf } from '../domain/barcode';

/**
 * A text as a bar code a counter's scanner reads (Code 128). Drawn as a picture that prints
 * sharp at any size; nothing is drawn when the text cannot be written.
 */
export function Barcode({ text, label }: { text: string; label: string }) {
  const bars = code128(text);
  if (!bars) return null;
  const quiet = 10;
  const width = modulesOf(bars) + quiet * 2;
  let x = quiet;
  const rects = bars.map((size, index) => {
    const at = x;
    x += size;
    // Bars and spaces alternate, starting with a bar.
    return index % 2 === 0 ? <rect key={at} x={at} y={0} width={size} height={40} /> : null;
  });
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} 40`}
      preserveAspectRatio="none"
      className="h-10 w-full fill-black"
      shapeRendering="crispEdges"
    >
      <rect x={0} y={0} width={width} height={40} fill="white" />
      {rects}
    </svg>
  );
}
