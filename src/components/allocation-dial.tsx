import { dialArcs, dialTicks } from "@/lib/dial-geometry";

export type DialSlice = { key: string; share: number; color: string };

/**
 * The Chronograph allocation dial: 60 minute ticks around the rim, one arc per allocation slice on an inner
 * ring, the largest slice named in the centre. Replaces the donut. Static SVG (no chart library, no motion);
 * the text legend next to it carries the exact figures, so this graphic is `aria-hidden` by default.
 */
export function AllocationDial({
  slices,
  centerValue,
  centerLabel,
  size = 160,
  className,
}: {
  slices: DialSlice[];
  /** Big text in the middle (e.g. "58%"). */
  centerValue?: string;
  /** Small caption under it (e.g. the largest category). */
  centerLabel?: string;
  size?: number;
  className?: string;
}) {
  const c = size / 2;
  const ringRadius = c * 0.66;
  const ticks = dialTicks(size, 1, size * 0.03, size * 0.06);
  const arcs = dialArcs(
    slices.map((s) => ({ key: s.key, share: s.share })),
    size,
    ringRadius,
  );
  const colorOf = new Map(slices.map((s) => [s.key, s.color]));
  const stroke = Math.max(4, size * 0.04);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={t.major ? "var(--primary)" : "var(--muted-foreground)"}
          strokeWidth={t.major ? 1.5 : 0.8}
          strokeOpacity={t.major ? 1 : 0.55}
        />
      ))}
      {arcs.map((a) =>
        a.full ? (
          <circle key={a.key} cx={c} cy={c} r={ringRadius} fill="none" stroke={colorOf.get(a.key)} strokeWidth={stroke} />
        ) : (
          <path key={a.key} d={a.path!} fill="none" stroke={colorOf.get(a.key)} strokeWidth={stroke} />
        ),
      )}
      {centerValue && (
        <text
          x={c}
          y={centerLabel ? c : c + size * 0.05}
          textAnchor="middle"
          fill="var(--foreground)"
          fontSize={size * 0.15}
          fontWeight={500}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {centerValue}
        </text>
      )}
      {centerLabel && (
        <text
          x={c}
          y={c + size * 0.1}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize={size * 0.06}
          letterSpacing={size * 0.008}
          className="font-index"
        >
          {centerLabel}
        </text>
      )}
    </svg>
  );
}
