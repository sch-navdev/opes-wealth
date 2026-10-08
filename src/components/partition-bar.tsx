import { cn } from "@/lib/utils";

export type PartitionSegment = { key: string; share: number; color: string };

/**
 * A flat, square-ended bar split into proportional segments (one per allocation slice) with a one-pixel gap.
 * Used where a dial would not fit (phones). Pattern from the 21st.dev "Partition Bar" (8starlabs), without the
 * rounded ends and slate text colour: widths are shares of the positive total, non-positive slices are dropped.
 * Decorative (`aria-hidden`): a legend with the exact figures always sits next to it.
 */
export function PartitionBar({
  segments,
  className,
}: {
  segments: PartitionSegment[];
  className?: string;
}) {
  const visible = segments.filter((s) => Number.isFinite(s.share) && s.share > 0);
  const total = visible.reduce((sum, s) => sum + s.share, 0);
  if (total <= 0) return null;
  return (
    <div aria-hidden="true" className={cn("flex h-2.5 w-full gap-px overflow-hidden bg-border", className)}>
      {visible.map((s) => (
        <div key={s.key} style={{ width: `${(s.share / total) * 100}%`, backgroundColor: s.color }} />
      ))}
    </div>
  );
}
