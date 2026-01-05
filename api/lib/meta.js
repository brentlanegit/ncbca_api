import { one } from "./db.js";

export async function getActiveMeta() {
  const row = await one(
    `
    SELECT lm.export_id, lm.season, lm.phase, lm.starting_season, lm.meta
    FROM league_meta lm
    JOIN exports e ON e.id = lm.export_id
    WHERE e.is_active = true
    LIMIT 1
    `
  );

  if (!row) {
    // No import yet or not marked active
    return null;
  }

  return row;
}
