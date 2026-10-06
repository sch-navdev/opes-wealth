/** Row density of the portfolio data table. Comfortable is the original look. */
export type TableDensity = "compact" | "comfortable";

export const TABLE_DENSITIES: readonly TableDensity[] = ["compact", "comfortable"];
export const DEFAULT_TABLE_DENSITY: TableDensity = "comfortable";
export const TABLE_DENSITY_KEY = "opes-table-density";

/** Narrow an unknown stored value to a density, falling back to the default. */
export function parseTableDensity(value: unknown): TableDensity {
  return value === "compact" || value === "comfortable" ? value : DEFAULT_TABLE_DENSITY;
}

/** Tailwind classes per density. Comfortable adds nothing (the table's own padding is the current look). */
export const TABLE_DENSITY_CLASSES: Record<TableDensity, { row: string; head: string }> = {
  comfortable: { row: "", head: "" },
  compact: { row: "text-xs [&>td]:py-1", head: "[&_th]:h-8" },
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Stored density, or the default when absent, invalid, or storage is unavailable / throws. */
export function readStoredTableDensity(storage: StorageLike | null = defaultStorage()): TableDensity {
  try {
    return parseTableDensity(storage?.getItem(TABLE_DENSITY_KEY));
  } catch {
    return DEFAULT_TABLE_DENSITY;
  }
}

/** Persist a density; returns false (never throws) when storage is unavailable or throws. */
export function writeStoredTableDensity(
  density: TableDensity,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(TABLE_DENSITY_KEY, density);
    return true;
  } catch {
    /* private mode or blocked storage: the choice just will not persist */
    return false;
  }
}
