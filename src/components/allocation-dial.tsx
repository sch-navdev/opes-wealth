import { dialArcs, dialTicks } from "@/lib/dial-geometry";

export type DialSlice = { key: string; share: number; color: string };

/**
 * The Chronograph allocation dial: 60 minute ticks around the rim, one arc per allocation slice on an inner
 * ring, the largest slice named in the centre. Replaces the donut. Static SVG (no chart library); the text
 * legend next to it carries the exact figures, so this graphic is `aria-hidden`.
 *
 * Optional pointer interaction (mouse and pen; keyboard users use the legend, which drives the same state):
 * `activeKey` thickens that arc and dims the others, `onActiveChange` reports the arc under the pointer (or
 * null when it leaves), and `onSelect` is called with the slice key on click. Each arc then gets a wider
 * invisible hit area so a six-pixel ring is easy to point at.
 */
export function AllocationDial({
  slices,
  centerValue,
  centerLabel,
  size = 160,
  className,
  activeKey = null,
  onActiveChange,
  onSelect,
}: {
  slices: DialSlice[];
  /** Big text in the middle (e.g. "58%"). */
  centerValue?: string;
  /** Small caption under it (e.g. the largest category). */
  centerLabel?: string;
  size?: number;
  className?: string;
  activeKey?: string | null;
  onActiveChange?: (key: string | null) => void;
  onSelect?: (key: string) => void;
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
  const interactive = Boolean(onActiveChange || onSelect);
  const hitStroke = size * 0.16;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
      onPointerLeave={interactive ? () => onActiveChange?.(null) : undefined}
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
      {arcs.map((a) => {
        const active = activeKey === a.key;
        const dimmed = activeKey != null && !active;
        const visible = {
          fill: "none",
          stroke: colorOf.get(a.key),
          strokeWidth: active ? stroke * 1.7 : stroke,
          opacity: dimmed ? 0.3 : 1,
          style: { transition: "stroke-width 0.15s ease, opacity 0.15s ease" },
        };
        return a.full ? (
          <circle key={a.key} cx={c} cy={c} r={ringRadius} {...visible} />
        ) : (
          <path key={a.key} d={a.path!} {...visible} />
        );
      })}
      {interactive &&
        arcs.map((a) => {
          const hit = {
            fill: "none",
            stroke: "transparent",
            strokeWidth: hitStroke,
            pointerEvents: "stroke" as const,
            style: { cursor: onSelect ? "pointer" : "default" },
            "data-dial-hit": a.key,
            onPointerEnter: () => onActiveChange?.(a.key),
            onClick: () => onSelect?.(a.key),
          };
          return a.full ? (
            <circle key={`hit-${a.key}`} cx={c} cy={c} r={ringRadius} {...hit} />
          ) : (
            <path key={`hit-${a.key}`} d={a.path!} {...hit} />
          );
        })}
      {centerValue && (
        <text
          x={c}
          y={centerLabel ? c : c + size * 0.05}
          textAnchor="middle"
          fill="var(--foreground)"
          fontSize={size * 0.15}
          fontWeight={500}
          style={{ fontVariantNumeric: "tabular-nums", pointerEvents: "none" }}
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
          style={{ pointerEvents: "none" }}
        >
          {centerLabel}
        </text>
      )}
    </svg>
  );
}
