import { q, one } from "../lib/db.js";
import { getActiveMeta } from "../lib/meta.js";

export default async function playerRoutes(app) {
  // Player search (name)
  app.get("/players/search", async (req) => {
    const qstr = (req.query.q ?? "").toString().trim();
    if (!qstr) return [];

    const res = await q(
      `
      SELECT pid, first_name, last_name, hgt_in, img_url, class_year, class_year_label, current_tid
      FROM players
      WHERE (first_name || ' ' || last_name) ILIKE $1
         OR last_name ILIKE $1
      ORDER BY last_name, first_name
      LIMIT 25
      `,
      [`%${qstr}%`]
    );

    return res.rows;
  });

  // Player profile (clean)
  app.get("/player/:pid", async (req) => {
    const pid = Number(req.params.pid);
    const meta = await getActiveMeta();
    const currentSeason = meta?.season ?? null;

    const player = await one(
      `
      SELECT
        pid,
        first_name,
        last_name,
        born_year,
        born_loc,
        hgt_in,
        weight_lbs,
        img_url,
        injury,
        class_year,
        class_year_label,
        college,
        current_tid,
        face
      FROM players
      WHERE pid = $1
      `,
      [pid]
    );
    if (!player) return { error: "Player not found" };

    // Latest rating row
    const rating = await one(
      `
      SELECT season, pos, ovr, pot, skills, ratings
      FROM player_ratings
      WHERE pid = $1
      ORDER BY season DESC
      LIMIT 1
      `,
      [pid]
    );

    // Latest regular-season stats (prefer current season if present)
    const stats = await one(
      `
      SELECT season, playoffs, tid, gp, gs, min, pts, orb, drb, ast, tov, stl, blk, stats
      FROM player_stats
      WHERE pid = $1 AND playoffs = false
      ORDER BY
        CASE WHEN season = $2 THEN 0 ELSE 1 END,
        season DESC
      LIMIT 1
      `,
      [pid, currentSeason]
    );

    // Awards
    const awards = await q(
      `
      SELECT season, type, details
      FROM player_awards
      WHERE pid = $1
      ORDER BY season DESC, type
      `,
      [pid]
    );

    return { player, rating, stats, awards: awards.rows };
  });

  // Player seasons list (great for bot/web tables)
  app.get("/player/:pid/seasons", async (req) => {
    const pid = Number(req.params.pid);

    const res = await q(
      `
      SELECT season, playoffs, tid, gp, gs, min, pts, orb, drb, ast, tov, stl, blk
      FROM player_stats
      WHERE pid = $1
      ORDER BY season DESC, playoffs ASC
      `,
      [pid]
    );

    return { pid, seasons: res.rows };
  });

  // RAW player: full player row + all ratings/stats/awards
  app.get("/player/:pid/raw", async (req) => {
    const pid = Number(req.params.pid);

    const player = await one(`SELECT * FROM players WHERE pid = $1`, [pid]);
    if (!player) return { error: "Player not found" };

    const ratings = await q(
      `SELECT * FROM player_ratings WHERE pid = $1 ORDER BY season`,
      [pid]
    );

    const stats = await q(
      `SELECT * FROM player_stats WHERE pid = $1 ORDER BY season, playoffs`,
      [pid]
    );

    const awards = await q(
      `SELECT * FROM player_awards WHERE pid = $1 ORDER BY season, type`,
      [pid]
    );

    return { player, ratings: ratings.rows, stats: stats.rows, awards: awards.rows };
  });

  // Players by class year
  app.get("/players/by-class/:year", async (req) => {
    const year = Number(req.params.year);
    if (!Number.isFinite(year)) return { error: "Invalid year" };

    const res = await q(
      `
      SELECT pid, first_name, last_name, hgt_in, img_url, class_year, class_year_label, current_tid
      FROM players
      WHERE class_year = $1
      ORDER BY last_name, first_name
      `,
      [year]
    );

    return res.rows;
  });
}
