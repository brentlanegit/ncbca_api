import { q, one } from "../lib/db.js";

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export default async function gameRoutes(app) {
  // Game detail + box score (clean)
  app.get("/game/:gid", async (req) => {
    const gid = Number(req.params.gid);

    const game = await one(
      `
      SELECT g.gid, g.season, g.day, g.home_tid, g.away_tid, g.home_pts, g.away_pts, g.num_periods, g.overtimes,
             ht.abbrev AS home_abbrev, ht.region AS home_region, ht.name AS home_name,
             at.abbrev AS away_abbrev, at.region AS away_region, at.name AS away_name
      FROM games g
      JOIN teams ht ON ht.tid = g.home_tid
      JOIN teams at ON at.tid = g.away_tid
      WHERE g.gid = $1
      `,
      [gid]
    );

    if (!game) return { error: "Game not found" };

    const totals = await q(
      `
      SELECT tid, is_home, totals
      FROM game_team_totals
      WHERE gid = $1
      ORDER BY is_home DESC
      `,
      [gid]
    );

    const lines = await q(
      `
      SELECT gpl.tid, gpl.is_home, gpl.pid, gpl.gs, gpl.min, gpl.pts, gpl.orb, gpl.drb, gpl.ast,
             p.first_name, p.last_name, p.img_url, p.injury
      FROM game_player_lines gpl
      JOIN players p ON p.pid = gpl.pid
      WHERE gpl.gid = $1
      ORDER BY gpl.is_home DESC, gpl.pts DESC NULLS LAST, gpl.min DESC NULLS LAST
      `,
      [gid]
    );

    return { game, teamTotals: totals.rows, playerLines: lines.rows };
  });

  // RAW game: full DB row + full JSON blobs
  app.get("/game/:gid/raw", async (req) => {
    const gid = Number(req.params.gid);

    const game = await one(`SELECT * FROM games WHERE gid = $1`, [gid]);
    if (!game) return { error: "Game not found" };

    const teamTotals = await q(
      `SELECT gid, tid, is_home, totals FROM game_team_totals WHERE gid = $1 ORDER BY is_home DESC`,
      [gid]
    );

    const playerLines = await q(
      `SELECT gid, tid, pid, is_home, line FROM game_player_lines WHERE gid = $1 ORDER BY is_home DESC, pid`,
      [gid]
    );

    return { game, teamTotals: teamTotals.rows, playerLines: playerLines.rows };
  });

  // Games on a season/day (played games)
  app.get("/games/day/:day", async (req) => {
    const day = Number(req.params.day);
    const season = req.query.season ? Number(req.query.season) : null;
    if (season == null) return { error: "Provide ?season=YYYY" };

    const res = await q(
      `
      SELECT g.gid, g.season, g.day,
             g.home_tid, ht.abbrev AS home_abbrev, g.home_pts,
             g.away_tid, at.abbrev AS away_abbrev, g.away_pts
      FROM games g
      JOIN teams ht ON ht.tid = g.home_tid
      JOIN teams at ON at.tid = g.away_tid
      WHERE g.season = $1 AND g.day = $2
      ORDER BY g.gid
      `,
      [season, day]
    );

    return { season, day, games: res.rows };
  });

  // Team game log for a season (played games only)
  app.get("/team/:tid/games", async (req) => {
    const tid = Number(req.params.tid);
    const season = req.query.season ? Number(req.query.season) : null;
    if (!season) return { error: "Provide ?season=YYYY" };

    const res = await q(
      `
      SELECT g.gid, g.season, g.day,
             g.home_tid, ht.abbrev AS home_abbrev, g.home_pts,
             g.away_tid, at.abbrev AS away_abbrev, g.away_pts
      FROM games g
      JOIN teams ht ON ht.tid = g.home_tid
      JOIN teams at ON at.tid = g.away_tid
      WHERE g.season = $1 AND (g.home_tid = $2 OR g.away_tid = $2)
      ORDER BY g.day, g.gid
      `,
      [season, tid]
    );

    return { season, tid, games: res.rows };
  });

  // Lookup a game (returns gid) by season/day + teams
  // /api/game/lookup?season=2027&day=32&homeTid=0&awayTid=69
  // Optional: anyOrder=true to allow swapped home/away
  app.get("/game/lookup", async (req) => {
    const season = req.query.season ? Number(req.query.season) : null;
    const day = req.query.day ? Number(req.query.day) : null;
    const homeTid = req.query.homeTid != null ? Number(req.query.homeTid) : null;
    const awayTid = req.query.awayTid != null ? Number(req.query.awayTid) : null;
    const anyOrder = (req.query.anyOrder ?? "false").toString() === "true";

    if (!season || day == null || homeTid == null || awayTid == null) {
      return { error: "Required: ?season=YYYY&day=NN&homeTid=X&awayTid=Y" };
    }

    const where = anyOrder
      ? `g.season=$1 AND g.day=$2 AND ((g.home_tid=$3 AND g.away_tid=$4) OR (g.home_tid=$4 AND g.away_tid=$3))`
      : `g.season=$1 AND g.day=$2 AND g.home_tid=$3 AND g.away_tid=$4`;

    const res = await q(
      `
      SELECT g.gid, g.season, g.day,
             g.home_tid, ht.abbrev AS home_abbrev, g.home_pts,
             g.away_tid, at.abbrev AS away_abbrev, g.away_pts
      FROM games g
      JOIN teams ht ON ht.tid = g.home_tid
      JOIN teams at ON at.tid = g.away_tid
      WHERE ${where}
      ORDER BY g.gid
      LIMIT 10
      `,
      [season, day, homeTid, awayTid]
    );

    return { season, day, homeTid, awayTid, anyOrder, matches: res.rows };
  });

  // -----------------------------
  // DISCORD-FRIENDLY RESULTS
  // -----------------------------
  // Returns a "results card" list for embeds: includes gid + API links.
  //
  // /api/results/day/:day?season=2027&baseUrl=http://localhost:3000
  //
  // baseUrl is optional; if omitted, we build relative API paths.
  app.get("/results/day/:day", async (req) => {
    const day = Number(req.params.day);
    const season = req.query.season ? Number(req.query.season) : null;
    if (season == null) return { error: "Provide ?season=YYYY" };

    const limit = clampInt(req.query.limit, 200, 1, 500);
    const baseUrl = (req.query.baseUrl ?? "").toString().replace(/\/+$/, "");

    const res = await q(
      `
      SELECT g.gid, g.season, g.day,
             g.home_tid, ht.abbrev AS home_abbrev, ht.region AS home_region, ht.name AS home_name, g.home_pts,
             g.away_tid, at.abbrev AS away_abbrev, at.region AS away_region, at.name AS away_name, g.away_pts
      FROM games g
      JOIN teams ht ON ht.tid = g.home_tid
      JOIN teams at ON at.tid = g.away_tid
      WHERE g.season = $1 AND g.day = $2
      ORDER BY g.gid
      LIMIT $3
      `,
      [season, day, limit]
    );

    const results = res.rows.map((g) => {
      const home = `${g.home_abbrev}`;
      const away = `${g.away_abbrev}`;
      const score = `${away} ${g.away_pts} @ ${home} ${g.home_pts}`;
      const winnerTid = g.home_pts > g.away_pts ? g.home_tid : g.away_tid;
      const winnerAbbrev = g.home_pts > g.away_pts ? g.home_abbrev : g.away_abbrev;

      const apiGame = `/api/game/${g.gid}`;
      const apiGameRaw = `/api/game/${g.gid}/raw`;

      return {
        gid: g.gid,
        season: g.season,
        day: g.day,
        home: {
          tid: g.home_tid,
          abbrev: g.home_abbrev,
          name: `${g.home_region} ${g.home_name}`,
          pts: g.home_pts,
        },
        away: {
          tid: g.away_tid,
          abbrev: g.away_abbrev,
          name: `${g.away_region} ${g.away_name}`,
          pts: g.away_pts,
        },
        winner: { tid: winnerTid, abbrev: winnerAbbrev },
        // Discord-friendly short strings
        text: score,
        title: `${away} @ ${home} (GID ${g.gid})`,
        // Links (relative + absolute if baseUrl provided)
        links: {
          apiGame,
          apiGameRaw,
          apiGameAbs: baseUrl ? `${baseUrl}${apiGame}` : null,
          apiGameRawAbs: baseUrl ? `${baseUrl}${apiGameRaw}` : null,
        },
      };
    });

    return { season, day, count: results.length, results };
  });
}
