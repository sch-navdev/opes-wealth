"use client";

import { useLanguage } from "@/context/language-context";
import { sparklinePath, sparklineTrend } from "@/lib/sparkline";
import { cn } from "@/lib/utils";

const TREND_COLOR = {
  up: "text-success",
  down: "text-destructive",
  flat: "text-muted-foreground",
} as const;

/**
 * Tiny inline-SVG trend line. Colour follows the trend (success / destructive /
 * muted, the same tokens used for gains and losses). Decorative (aria-hidden)
 * unless `label` is true, in which case it is an image with a trend description.
 * The draw-in is pure CSS (`.spark-draw` in globals.css) and is off under
 * `prefers-reduced-motion`. Renders nothing for fewer than 2 points.
 */
export function MicroSparkline({
  values,
  className,
  width = 64,
  height = 20,
  label = false,
}: {
  values: number[];
  className?: string;
  width?: number;
  height?: number;
  label?: boolean;
}) {
  const { t } = useLanguage();
  if (!values || values.length < 2) return null;
  const trend = sparklineTrend(values);
  const d = sparklinePath(values, width, height, 2);
  if (!d) return null;
  const a11y = label
    ? { role: "img" as const, "aria-label": t(trend === "up" ? "spark_up" : trend === "down" ? "spark_down" : "spark_flat") }
    : { "aria-hidden": true as const };
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0 overflow-visible", TREND_COLOR[trend], className)}
      {...a11y}
    >
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="spark-draw"
      />
    </svg>
  );
}
