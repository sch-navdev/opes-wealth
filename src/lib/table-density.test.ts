import { describe, expect, it } from "vitest";
import {
  DEFAULT_TABLE_DENSITY,
  TABLE_DENSITY_CLASSES,
  TABLE_DENSITY_KEY,
  parseTableDensity,
  readStoredTableDensity,
  writeStoredTableDensity,
} from "@/lib/table-density";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe("table density", () => {
  it("uses a stable key and defaults to comfortable (the current look)", () => {
    expect(TABLE_DENSITY_KEY).toBe("opes-table-density");
    expect(DEFAULT_TABLE_DENSITY).toBe("comfortable");
    expect(TABLE_DENSITY_CLASSES.comfortable).toEqual({ row: "", head: "" });
    expect(TABLE_DENSITY_CLASSES.compact.row).not.toBe("");
  });

  it("parses valid values and rejects everything else", () => {
    expect(parseTableDensity("compact")).toBe("compact");
    expect(parseTableDensity("comfortable")).toBe("comfortable");
    for (const bad of ["", "dense", null, undefined, 3, {}]) expect(parseTableDensity(bad)).toBe("comfortable");
  });

  it("round-trips through storage", () => {
    const s = memoryStorage();
    expect(writeStoredTableDensity("compact", s)).toBe(true);
    expect(s.data[TABLE_DENSITY_KEY]).toBe("compact");
    expect(readStoredTableDensity(s)).toBe("compact");
  });

  it("falls back to the default for garbage, null storage, or throwing storage", () => {
    expect(readStoredTableDensity(memoryStorage({ [TABLE_DENSITY_KEY]: "huge" }))).toBe("comfortable");
    expect(readStoredTableDensity(null)).toBe("comfortable");
    const boom = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readStoredTableDensity(boom)).toBe("comfortable");
    expect(writeStoredTableDensity("compact", boom)).toBe(false);
    expect(writeStoredTableDensity("compact", null)).toBe(false);
  });
});
