function safeInt(x) {
  return typeof x === "number" ? x : null;
}

export async function upsertPlayers(client, players) {
  for (const p of players) {
    if (typeof p.pid !== "number") {
      throw new Error(
        `Player missing pid (name=${p.firstName ?? ""} ${p.lastName ?? ""})`
      );
    }

    const classYear = safeInt(p?.draft?.year);

    await client.query(
      `
      INSERT INTO players
        (pid, first_name, last_name, born_year, born_loc, hgt_in, weight_lbs, img_url, injury, class_year, college, face, current_tid, updated_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13, now())
      ON CONFLICT (pid) DO UPDATE SET
        first_name=EXCLUDED.first_name,
        last_name=EXCLUDED.last_name,
        born_year=EXCLUDED.born_year,
        born_loc=EXCLUDED.born_loc,
        hgt_in=EXCLUDED.hgt_in,
        img_url=EXCLUDED.img_url,
        injury=EXCLUDED.injury,
        class_year=EXCLUDED.class_year,
        face=EXCLUDED.face,
        weight_lbs=EXCLUDED.weight_lbs,
        college=EXCLUDED.college,
        current_tid=EXCLUDED.current_tid,
        updated_at=now()
      `,
      [
        p.pid,
        p.firstName ?? "",
        p.lastName ?? "",
        safeInt(p?.born?.year),
        p?.born?.loc ?? null,
        safeInt(p.hgt),
        safeInt(p.weight),
        p.imgURL ?? null,
        JSON.stringify(p.injury ?? null),
        classYear,
        p.college ?? null,
        JSON.stringify(p.face ?? null),
        // IMPORTANT: this is the true "current status" tid from the export (-3 alumni, -2 HS, -1 portal, >=0 active)
        safeInt(p.tid),
      ]
    );
  }
}

/**
 * Archive mode for player ratings:
 * - Update ONLY currentSeason
 * - Past seasons: insert if missing, otherwise DO NOTHING
 */
export async function upsertPlayerRatings(client, players, currentSeason) {
  for (const p of players) {
    const ratings = Array.isArray(p.ratings) ? p.ratings : [];
    for (const r of ratings) {
      const isCurrent = r.season === currentSeason;

      const conflictSql = isCurrent
        ? `ON CONFLICT (pid, season) DO UPDATE SET
            pos=EXCLUDED.pos,
            ovr=EXCLUDED.ovr,
            pot=EXCLUDED.pot,
            skills=EXCLUDED.skills,
            ratings=EXCLUDED.ratings`
        : `ON CONFLICT (pid, season) DO NOTHING`;

      await client.query(
        `
        INSERT INTO player_ratings (pid, season, pos, ovr, pot, skills, ratings)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
        ${conflictSql}
        `,
        [
          p.pid,
          r.season,
          r.pos ?? null,
          safeInt(r.ovr),
          safeInt(r.pot),
          JSON.stringify(r.skills ?? []),
          JSON.stringify(r),
        ]
      );
    }
  }
}

/**
 * Archive mode for player stats:
 * - Update ONLY currentSeason
 * - Past seasons: insert if missing, otherwise DO NOTHING
 *
 * Note: we skip tid < 0 due to FK to teams(tid). (Prospects/transfers/retired still exist in players/ratings.)
 */
export async function upsertPlayerStats(client, players, currentSeason) {
  for (const p of players) {
    const stats = Array.isArray(p.stats) ? p.stats : [];
    for (const s of stats) {
      if (typeof s.tid !== "number" || s.tid < 0) continue;

      const isCurrent = s.season === currentSeason;

      const conflictSql = isCurrent
        ? `ON CONFLICT (pid, season, playoffs) DO UPDATE SET
            tid=EXCLUDED.tid,
            gp=EXCLUDED.gp,
            gs=EXCLUDED.gs,
            min=EXCLUDED.min,
            pts=EXCLUDED.pts,
            orb=EXCLUDED.orb,
            drb=EXCLUDED.drb,
            ast=EXCLUDED.ast,
            tov=EXCLUDED.tov,
            stl=EXCLUDED.stl,
            blk=EXCLUDED.blk,
            stats=EXCLUDED.stats`
        : `ON CONFLICT (pid, season, playoffs) DO NOTHING`;

      await client.query(
        `
        INSERT INTO player_stats
          (pid, season, playoffs, tid, gp, gs, min, pts, orb, drb, ast, tov, stl, blk, stats)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
        ${conflictSql}
        `,
        [
          p.pid,
          s.season,
          !!s.playoffs,
          s.tid,
          safeInt(s.gp),
          safeInt(s.gs),
          typeof s.min === "number" ? s.min : null,
          safeInt(s.pts),
          safeInt(s.orb),
          safeInt(s.drb),
          safeInt(s.ast),
          safeInt(s.tov),
          safeInt(s.stl),
          safeInt(s.blk),
          JSON.stringify(s),
        ]
      );
    }
  }
}

export async function upsertPlayerAwards(client, players) {
  for (const p of players) {
    const awards = Array.isArray(p.awards) ? p.awards : [];
    for (const a of awards) {
      if (typeof a.season !== "number" || !a.type) continue;

      await client.query(
        `
        INSERT INTO player_awards (pid, season, type, details)
        VALUES ($1,$2,$3,$4::jsonb)
        ON CONFLICT (pid, season, type) DO UPDATE SET
          details=EXCLUDED.details
        `,
        [p.pid, a.season, a.type, JSON.stringify(a)]
      );
    }
  }
}
