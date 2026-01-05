import { q, one } from "../lib/db.js";
import { getActiveMeta } from "../lib/meta.js";

export default async function teamRoutes(app) {
  // List teams (exclude negative "system teams" by default)
  app.get("/teams", async (req) => {
    const includeSystem = req.query.includeSystem === "true";
    const where = includeSystem ? "" : "WHERE tid >= 0";

    const res = await q(
      `
      SELECT tid, cid, did, region, name, abbrev, img_url, colors, jersey, disabled
      FROM teams
      ${where}
      ORDER BY region, name
      `
    );
    return res.rows;
  });

  // Find a team by abbrev or name-ish
  app.get("/teams/search", async (req) => {
    const qstr = (req.query.q ?? "").toString().trim();
    if (!qstr) return [];

    const res = await q(
      `
      SELECT tid, region, name, abbrev, cid, did, img_url
      FROM teams
      WHERE tid >= 0 AND (
        abbrev ILIKE $1 OR
        region ILIKE $1 OR
        name ILIKE $1 OR
        (region || ' ' || name) ILIKE $1
      )
      ORDER BY
        CASE WHEN abbrev ILIKE $2 THEN 0 ELSE 1 END,
        region, name
      LIMIT 25
      `,
      [`%${qstr}%`, qstr]
    );

    return res.rows;
  });

  // Team detail (includes record for season)
  app.get("/team/:tid", async (req) => {
    const tid = Number(req.params.tid);
    const meta = await getActiveMeta();
    const season = req.query.season ? Number(req.query.season) : meta?.season;

    const team = await one(
      `
      SELECT tid, cid, did, region, name, abbrev, img_url, colors, jersey, disabled
      FROM teams
      WHERE tid = $1
      `,
      [tid]
    );
    if (!team) return { error: "Team not found" };

    let seasonRow = null;
    if (season != null && Number.isFinite(season)) {
      seasonRow = await one(
        `
        SELECT season, won, lost, won_conf, lost_conf, won_div, lost_div, streak, hype
        FROM team_seasons
        WHERE tid = $1 AND season = $2
        `,
        [tid, season]
      );
    }

    return { team, season: seasonRow };
  });

  // Roster: players with stats rows for tid+season (playoffs false)
  app.get("/team/:tid/roster", async (req) => {
    const tid = Number(req.params.tid);
    const meta = await getActiveMeta();
    const season = req.query.season ? Number(req.query.season) : meta?.season;
    if (season == null) return { error: "No active export/season. Import first." };

    const res = await q(
      `
      SELECT
        p.pid,
        p.first_name,
        p.last_name,
        p.hgt_in,
        p.img_url,
        p.injury,
        p.class_year,
        pr.pos,
        pr.ovr,
        pr.pot,
        pr.skills,
        ps.gp,
        ps.gs,
        ps.min,
        ps.pts,
        ps.orb,
        ps.drb,
        ps.ast,
        ps.stl,
        ps.blk
      FROM player_stats ps
      JOIN players p ON p.pid = ps.pid
      LEFT JOIN player_ratings pr ON pr.pid = p.pid AND pr.season = ps.season
      WHERE ps.tid = $1 AND ps.season = $2 AND ps.playoffs = false
      ORDER BY pr.ovr DESC NULLS LAST, ps.pts DESC NULLS LAST
      `,
      [tid, season]
    );

    return { tid, season, players: res.rows };
  });

  // RAW team: full team row + all team_seasons + all team_stats
  app.get("/team/:tid/raw", async (req) => {
    const tid = Number(req.params.tid);

    const team = await one(`SELECT * FROM teams WHERE tid = $1`, [tid]);
    if (!team) return { error: "Team not found" };

    const seasons = await q(`SELECT * FROM team_seasons WHERE tid = $1 ORDER BY season`, [tid]);
    const stats = await q(`SELECT * FROM team_stats WHERE tid = $1 ORDER BY season, playoffs`, [tid]);

    return { team, seasons: seasons.rows, stats: stats.rows };
  });
}
