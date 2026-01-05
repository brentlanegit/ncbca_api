export async function upsertLeagueMeta(client, exportId, gameAttributes) {
  const season = gameAttributes.season;
  const phase = gameAttributes.phase;
  const startingSeason = gameAttributes.startingSeason ?? null;

  await client.query(
    `
    INSERT INTO league_meta (export_id, season, phase, starting_season, meta)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    ON CONFLICT (export_id) DO UPDATE
      SET season = EXCLUDED.season,
          phase = EXCLUDED.phase,
          starting_season = EXCLUDED.starting_season,
          meta = EXCLUDED.meta
    `,
    [exportId, season, phase, startingSeason, JSON.stringify(gameAttributes)]
  );

  return { season, phase };
}

export async function upsertConfsDivs(client, gameAttributes) {
  const confs = gameAttributes.confs ?? [];
  const divs = gameAttributes.divs ?? [];

  // Conferences
  for (const c of confs) {
    if (typeof c.cid !== "number") continue;
    await client.query(
      `
      INSERT INTO conferences (cid, name)
      VALUES ($1, $2)
      ON CONFLICT (cid) DO UPDATE SET name = EXCLUDED.name
      `,
      [c.cid, c.name ?? `Conference ${c.cid}`]
    );
  }

  // Divisions
  for (const d of divs) {
    if (typeof d.did !== "number") continue;
    await client.query(
      `
      INSERT INTO divisions (did, cid, name)
      VALUES ($1, $2, $3)
      ON CONFLICT (did) DO UPDATE
        SET cid = EXCLUDED.cid,
            name = EXCLUDED.name
      `,
      [d.did, d.cid ?? 0, d.name ?? `Division ${d.did}`]
    );
  }
}
