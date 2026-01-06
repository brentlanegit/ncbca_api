export async function upsertGames(client, games) {
  for (const g of games) {
    const gid = g.gid;
    const season = g.season;
    const day = g.day ?? 0;

    // Home team always first (your rule)
    const home = g.teams?.[0];
    const away = g.teams?.[1];
    if (!home || !away) continue;

    const homeTid = home.tid;
    const awayTid = away.tid;

    // ---- GID COLLISION DETECTION ----
    // If gid already exists but looks like a different game, warn loudly and skip.
    const existing = await client.query(
      `SELECT gid, season, home_tid, away_tid, home_pts, away_pts FROM games WHERE gid = $1`,
      [gid]
    );

    if (existing.rows.length > 0) {
      const ex = existing.rows[0];

      const looksDifferent =
        ex.season !== season ||
        ex.home_tid !== homeTid ||
        ex.away_tid !== awayTid;

      if (looksDifferent) {
        console.warn(
          `[GID COLLISION] gid=${gid} already exists in DB as season=${ex.season} (${ex.home_tid} vs ${ex.away_tid}), incoming season=${season} (${homeTid} vs ${awayTid}). Skipping incoming game to preserve archive.`
        );

        await client.query(
          `
          INSERT INTO gid_conflicts
            (gid, existing_season, existing_home_tid, existing_away_tid, incoming_season, incoming_home_tid, incoming_away_tid, existing_game, incoming_game)
          VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
          `,
          [
            gid,
            ex.season,
            ex.home_tid,
            ex.away_tid,
            season,
            homeTid,
            awayTid,
            JSON.stringify(ex),
            JSON.stringify(g),
          ]
        );
      }

      // Archive behavior: never overwrite an existing gid
      continue;
    }

    // Determine pts (prefer team objects)
    const homePts =
      typeof home.pts === "number"
        ? home.pts
        : g.won?.tid === homeTid
          ? g.won?.pts
          : g.lost?.pts;

    const awayPts =
      typeof away.pts === "number"
        ? away.pts
        : g.won?.tid === awayTid
          ? g.won?.pts
          : g.lost?.pts;

    // ---- ARCHIVE INSERTS (no overwrites) ----
    await client.query(
      `
      INSERT INTO games (gid, season, day, home_tid, away_tid, home_pts, away_pts, num_periods, overtimes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (gid) DO NOTHING
      `,
      [
        gid,
        season,
        day,
        homeTid,
        awayTid,
        homePts ?? 0,
        awayPts ?? 0,
        g.numPeriods ?? null,
        g.overtimes ?? null,
      ]
    );

    // Team totals: archive (do not overwrite)
    await upsertGameTeamTotalsArchive(client, gid, homeTid, true, home);
    await upsertGameTeamTotalsArchive(client, gid, awayTid, false, away);

    // Player lines: archive (do not overwrite)
    await upsertGamePlayerLinesArchive(client, gid, homeTid, true, home?.players ?? []);
    await upsertGamePlayerLinesArchive(client, gid, awayTid, false, away?.players ?? []);
  }
}

async function upsertGameTeamTotalsArchive(client, gid, tid, isHome, teamObj) {
  await client.query(
    `
    INSERT INTO game_team_totals (gid, tid, is_home, totals)
    VALUES ($1,$2,$3,$4::jsonb)
    ON CONFLICT (gid, tid) DO NOTHING
    `,
    [gid, tid, isHome, JSON.stringify(teamObj)]
  );
}

async function upsertGamePlayerLinesArchive(client, gid, tid, isHome, playerLines) {
  for (const pl of playerLines) {
    const pid = pl.pid;
    if (typeof pid !== "number") continue;

    await client.query(
      `
      INSERT INTO game_player_lines
        (gid, tid, pid, is_home, gs, min, pts, orb, drb, ast, line)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
      ON CONFLICT (gid, pid) DO NOTHING
      `,
      [
        gid,
        tid,
        pid,
        isHome,
        pl.gs ?? null,
        typeof pl.min === "number" ? pl.min : null,
        typeof pl.pts === "number" ? pl.pts : null,
        typeof pl.orb === "number" ? pl.orb : null,
        typeof pl.drb === "number" ? pl.drb : null,
        typeof pl.ast === "number" ? pl.ast : null,
        JSON.stringify(pl),
      ]
    );
  }
}
