import { q } from "../lib/db.js";
import { getActiveMeta } from "../lib/meta.js";

// Allowed stats for leaders (map query param -> DB column)
const STAT_MAP = {
  pts: "pts",
  ast: "ast",
  trb: "(orb + drb)",
  orb: "orb",
  drb: "drb",
  stl: "stl",
  blk: "blk",
  tov: "tov",
  min: "min",
};

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export default async function leadersRoutes(app) {
  // League leaders
  // /api/leaders?season=2027&stat=pts&mode=total|per_game&limit=25&minGp=5
  app.get("/leaders", async (req) => {
    const meta = await getActiveMeta();
    const season = req.query.season ? Number(req.query.season) : meta?.season;
    if (!season) return { error: "Provide ?season=YYYY (or import an active export)" };

    const statKey = (req.query.stat ?? "pts").toString();
    const statExpr = STAT_MAP[statKey];
    if (!statExpr) return { error: `Invalid stat. Allowed: ${Object.keys(STAT_MAP).join(", ")}` };

    const mode = (req.query.mode ?? "total").toString(); // "total" or "per_game"
    const limit = clampInt(req.query.limit, 25, 1, 200);
    const minGp = clampInt(req.query.minGp, 0, 0, 100);

    const valueExpr =
      mode === "per_game"
        ? `(${statExpr})::float / NULLIF(ps.gp, 0)`
        : `(${statExpr})::float`;

    const res = await q(
      `
      SELECT
        ps.pid,
        p.first_name,
        p.last_name,
        ps.tid,
        t.abbrev AS team_abbrev,
        pr.pos,
        pr.ovr,
        ps.gp,
        (${statExpr})::float AS total,
        ((${statExpr})::float / NULLIF(ps.gp, 0)) AS per_game,
        ${valueExpr} AS value
      FROM player_stats ps
      JOIN players p ON p.pid = ps.pid
      JOIN teams t ON t.tid = ps.tid
      LEFT JOIN player_ratings pr ON pr.pid = ps.pid AND pr.season = ps.season
      WHERE ps.season = $1
        AND ps.playoffs = false
        AND ps.gp >= $2
        AND ps.tid >= 0
      ORDER BY value DESC NULLS LAST, ps.gp DESC, p.last_name, p.first_name
      LIMIT $3
      `,
      [season, minGp, limit]
    );

    return {
      season,
      stat: statKey,
      mode,
      limit,
      minGp,
      leaders: res.rows,
    };
  });

  // Team leaders
  // /api/team/:tid/leaders?season=2027&stat=pts&mode=total|per_game&limit=15&minGp=1
  app.get("/team/:tid/leaders", async (req) => {
    const tid = Number(req.params.tid);
    const meta = await getActiveMeta();
    const season = req.query.season ? Number(req.query.season) : meta?.season;
    if (!season) return { error: "Provide ?season=YYYY (or import an active export)" };

    const statKey = (req.query.stat ?? "pts").toString();
    const statExpr = STAT_MAP[statKey];
    if (!statExpr) return { error: `Invalid stat. Allowed: ${Object.keys(STAT_MAP).join(", ")}` };

    const mode = (req.query.mode ?? "total").toString();
    const limit = clampInt(req.query.limit, 15, 1, 200);
    const minGp = clampInt(req.query.minGp, 0, 0, 100);

    const valueExpr =
      mode === "per_game"
        ? `(${statExpr})::float / NULLIF(ps.gp, 0)`
        : `(${statExpr})::float`;

    const res = await q(
      `
      SELECT
        ps.pid,
        p.first_name,
        p.last_name,
        ps.tid,
        pr.pos,
        pr.ovr,
        ps.gp,
        (${statExpr})::float AS total,
        ((${statExpr})::float / NULLIF(ps.gp, 0)) AS per_game,
        ${valueExpr} AS value
      FROM player_stats ps
      JOIN players p ON p.pid = ps.pid
      LEFT JOIN player_ratings pr ON pr.pid = ps.pid AND pr.season = ps.season
      WHERE ps.season = $1
        AND ps.playoffs = false
        AND ps.tid = $2
        AND ps.gp >= $3
      ORDER BY value DESC NULLS LAST, ps.gp DESC, p.last_name, p.first_name
      LIMIT $4
      `,
      [season, tid, minGp, limit]
    );

    return { season, tid, stat: statKey, mode, limit, minGp, leaders: res.rows };
  });
}
