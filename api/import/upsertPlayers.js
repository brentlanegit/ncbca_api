function safeInt(x) {
  return typeof x === "number" ? x : null;
}

function mapClassIndexToLabel(classIndex) {
  if (classIndex <= 0) return "FR";
  if (classIndex === 1) return "SO";
  if (classIndex === 2) return "JR";
  return "SR";
}

function countPriorSeasonsWithStats(stats, currentSeason) {
  const seasons = new Set();
  for (const s of stats) {
    if (!s || s.playoffs) continue;
    if (typeof s.season !== "number" || s.season >= currentSeason) continue;
    if (typeof s.gp !== "number" || s.gp <= 0) continue;
    seasons.add(s.season);
  }
  return seasons.size;
}

function hasStatsInSeason(stats, season) {
  for (const s of stats) {
    if (!s || s.playoffs) continue;
    if (s.season !== season) continue;
    if (typeof s.gp === "number" && s.gp > 0) return true;
  }
  return false;
}

function calcClassYearLabel(player, currentSeason) {
  const tid = typeof player.tid === "number" ? player.tid : null;
  if (tid === -2) return "HS";
  if (tid === -3) return "GR";

  if (typeof currentSeason !== "number") return null;

  const stats = Array.isArray(player.stats) ? player.stats : [];
  const draftYear = safeInt(player?.draft?.year);

  if (draftYear != null) {
    const entrySeason = draftYear + 1;
    const seasonsElapsed = Math.max(0, currentSeason - entrySeason);
    const redshirt = entrySeason <= currentSeason && !hasStatsInSeason(stats, entrySeason);
    const classIndex = Math.max(0, seasonsElapsed - (redshirt ? 1 : 0));
    const label = mapClassIndexToLabel(classIndex);
    return redshirt ? `RS ${label}` : label;
  }

  const classIndex = countPriorSeasonsWithStats(stats, currentSeason);
  return mapClassIndexToLabel(classIndex);
}

export async function upsertPlayers(client, players, currentSeason) {
  for (const p of players) {
    if (typeof p.pid !== "number") {
      throw new Error(
        `Player missing pid (name=${p.firstName ?? ""} ${p.lastName ?? ""})`
      );
    }

    const classYear = safeInt(p?.draft?.year);
    const classYearLabel = calcClassYearLabel(p, currentSeason);

    await client.query(
      `
      INSERT INTO players
        (pid, first_name, last_name, born_year, born_loc, hgt_in, weight_lbs, img_url, injury, class_year, class_year_label, college, face, current_tid, updated_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13::jsonb,$14, now())
      ON CONFLICT (pid) DO UPDATE SET
        first_name=EXCLUDED.first_name,
        last_name=EXCLUDED.last_name,
        born_year=EXCLUDED.born_year,
        born_loc=EXCLUDED.born_loc,
        hgt_in=EXCLUDED.hgt_in,
        img_url=EXCLUDED.img_url,
        injury=EXCLUDED.injury,
        class_year=EXCLUDED.class_year,
        class_year_label=EXCLUDED.class_year_label,
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
        classYearLabel,
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
