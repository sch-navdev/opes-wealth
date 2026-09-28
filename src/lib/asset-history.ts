/**
 * Every value `asset_history.source` is ever set to from app code. The live
 * column itself has no CHECK constraint (plain `text`), but every writer
 * should still go through this union so a typo can't silently create a new,
 * unrecognized source value.
 */
export type AssetHistorySource = "manual" | "dari" | "dubailand" | "csv_import";
