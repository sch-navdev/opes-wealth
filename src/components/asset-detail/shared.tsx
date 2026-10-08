"use client";

export function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

export function ProgressBar({
  percent,
  colorClassName,
}: {
  percent: number;
  colorClassName: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 w-full min-w-0 overflow-hidden bg-muted">
      <div
        className={`h-full ${colorClassName}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
