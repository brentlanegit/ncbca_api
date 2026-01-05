export async function upsertTeams(client, teams) {
  for (const t of teams) {
    await client.query(
      `
      INSERT INTO teams (tid, cid, did, region, name, abbrev, img_url, colors, jersey, disabled, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10, now())
      ON CONFLICT (tid) DO UPDATE SET
        cid = EXCLUDED.cid,
        did = EXCLUDED.did,
        region = EXCLUDED.region,
        name = EXCLUDED.name,
        abbrev = EXCLUDED.abbrev,
        img_url = EXCLUDED.img_url,
        colors = EXCLUDED.colors,
        jersey = EXCLUDED.jersey,
        disabled = EXCLUDED.disabled,
        updated_at = now()
      `,
      [
        t.tid,
        t.cid ?? 0,
        t.did ?? 0,
        t.region ?? "",
        t.name ?? "",
        t.abbrev ?? "",
        t.imgURL ?? null,
        JSON.stringify(t.colors ?? null),
        t.jersey ?? null,
        !!t.disabled,
      ]
    );
  }
}

/**
 * Archive mode for team seasons:
 * - Update ONLY currentSeason
 * - Past seasons: insert if missing, otherwise DO NOTHING
 */
export async function upsertTeamSeasons(client, teams, currentSeason) {
  for (const t of teams) {
    const seasons = Array.isArray(t.seasons) ? t.seasons : [];
    for (const s of seasons) {
      const isCurrent = s.season === currentSeason;

      const conflictSql = isCurrent
        ? `ON CONFLICT (tid, season) DO UPDATE SET
            won = EXCLUDED.won,
            lost = EXCLUDED.lost,
            won_conf = EXCLUDED.won_conf,
            lost_conf = EXCLUDED.lost_conf,
            won_div = EXCLUDED.won_div,
            lost_div = EXCLUDED.lost_div,
            streak = EXCLUDED.streak,
            hype = EXCLUDED.hype,
            rid = EXCLUDED.rid`
        : `ON CONFLICT (tid, season) DO NOTHING`;

      await client.query(
        `
        INSERT INTO team_seasons
          (tid, season, won, lost, won_conf, lost_conf, won_div, lost_div, streak, hype, rid)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ${conflictSql}
        `,
        [
          s.tid ?? t.tid,
          s.season,
          s.won ?? 0,
          s.lost ?? 0,
          s.wonConf ?? null,
          s.lostConf ?? null,
          s.wonDiv ?? null,
          s.lostDiv ?? null,
          s.streak ?? null,
          s.hype ?? null,
          s.rid ?? null,
        ]
      );
    }
  }
}

/**
 * Archive mode for team stats:
 * - Update ONLY currentSeason
 * - Past seasons: insert if missing, otherwise DO NOTHING
 */
export async function upsertTeamStats(client, teams, currentSeason) {
  for (const t of teams) {
    const stats = Array.isArray(t.stats) ? t.stats : [];
    for (const s of stats) {
      const isCurrent = s.season === currentSeason;

      const conflictSql = isCurrent
        ? `ON CONFLICT (tid, season, playoffs) DO UPDATE SET
            gp=EXCLUDED.gp, min=EXCLUDED.min,
            fg=EXCLUDED.fg, fga=EXCLUDED.fga,
            tp=EXCLUDED.tp, tpa=EXCLUDED.tpa,
            ft=EXCLUDED.ft, fta=EXCLUDED.fta,
            orb=EXCLUDED.orb, drb=EXCLUDED.drb,
            ast=EXCLUDED.ast, tov=EXCLUDED.tov,
            stl=EXCLUDED.stl, blk=EXCLUDED.blk,
            pf=EXCLUDED.pf, pts=EXCLUDED.pts,
            opp_pts=EXCLUDED.opp_pts`
        : `ON CONFLICT (tid, season, playoffs) DO NOTHING`;

      await client.query(
        `
        INSERT INTO team_stats
          (tid, season, playoffs, gp, min, fg, fga, tp, tpa, ft, fta, orb, drb, ast, tov, stl, blk, pf, pts, opp_pts)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        ${conflictSql}
        `,
        [
          s.tid ?? t.tid,
          s.season,
          !!s.playoffs,
          s.gp ?? 0,
          s.min ?? null,
          s.fg ?? null,
          s.fga ?? null,
          s.tp ?? null,
          s.tpa ?? null,
          s.ft ?? null,
          s.fta ?? null,
          s.orb ?? null,
          s.drb ?? null,
          s.ast ?? null,
          s.tov ?? null,
          s.stl ?? null,
          s.blk ?? null,
          s.pf ?? null,
          s.pts ?? null,
          s.oppPts ?? null,
        ]
      );
    }
  }
}
