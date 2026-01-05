import { q } from "../lib/db.js";
import { getActiveMeta } from "../lib/meta.js";

export default async function scheduleRoutes(app) {
  // Schedule for a team (pretty / joined team info)
  app.get("/schedule/:tid", async (req) => {
    const tid = Number(req.params.tid);
    const meta = await getActiveMeta();
    const season = req.query.season ? Number(req.query.season) : meta?.season;
    if (season == null) return { error: "No active export/season. Import first." };

    const res = await q(
      `
      SELECT s.gid, s.day,
             s.home_tid, ht.region AS home_region, ht.name AS home_name, ht.abbrev AS home_abbrev,
             s.away_tid, at.region AS away_region, at.name AS away_name, at.abbrev AS away_abbrev
      FROM schedule s
      JOIN teams ht ON ht.tid = s.home_tid
      JOIN teams at ON at.tid = s.away_tid
      WHERE s.season = $1 AND (s.home_tid = $2 OR s.away_tid = $2)
      ORDER BY s.day, s.gid
      `,
      [season, tid]
    );

    return { season, tid, games: res.rows };
  });

  // All scheduled games on a given day (pretty)
  app.get("/schedule/day/:day", async (req) => {
    const day = Number(req.params.day);
    const meta = await getActiveMeta();
    const season = req.query.season ? Number(req.query.season) : meta?.season;
    if (season == null) return { error: "No active export/season. Import first." };

    const res = await q(
      `
      SELECT s.gid, s.day,
             s.home_tid, ht.abbrev AS home_abbrev, ht.region AS home_region, ht.name AS home_name,
             s.away_tid, at.abbrev AS away_abbrev, at.region AS away_region, at.name AS away_name
      FROM schedule s
      JOIN teams ht ON ht.tid = s.home_tid
      JOIN teams at ON at.tid = s.away_tid
      WHERE s.season = $1 AND s.day = $2
      ORDER BY s.gid
      `,
      [season, day]
    );

    return { season, day, games: res.rows };
  });

  // -----------------------------
  // RAW SCHEDULE ENDPOINTS
  // -----------------------------

  // Raw schedule for entire season (no joins; pure DB rows)
  // /api/schedule/raw?season=2027
  app.get("/schedule/raw", async (req) => {
    const meta = await getActiveMeta();
    const season = req.query.season ? Number(req.query.season) : meta?.season;
    if (season == null) return { error: "No active export/season. Import first." };

    const res = await q(
      `
      SELECT gid, season, day, home_tid, away_tid
      FROM schedule
      WHERE season = $1
      ORDER BY day, gid
      `,
      [season]
    );

    return { season, games: res.rows };
  });

  // Raw schedule for a team in a season (no joins; pure DB rows)
  // /api/schedule/:tid/raw?season=2027
  app.get("/schedule/:tid/raw", async (req) => {
    const tid = Number(req.params.tid);
    const meta = await getActiveMeta();
    const season = req.query.season ? Number(req.query.season) : meta?.season;
    if (season == null) return { error: "No active export/season. Import first." };

    const res = await q(
      `
      SELECT gid, season, day, home_tid, away_tid
      FROM schedule
      WHERE season = $1 AND (home_tid = $2 OR away_tid = $2)
      ORDER BY day, gid
      `,
      [season, tid]
    );

    return { season, tid, games: res.rows };
  });
}
