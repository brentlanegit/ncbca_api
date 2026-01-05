import { q } from "../lib/db.js";
import { getActiveMeta } from "../lib/meta.js";

export default async function standingsRoutes(app) {
  // /standings?season=2027&cid=0&did=1
  app.get("/standings", async (req) => {
    const meta = await getActiveMeta();
    const season = req.query.season ? Number(req.query.season) : meta?.season;
    if (season == null) return { error: "No active export/season. Import first." };

    const cid = req.query.cid != null ? Number(req.query.cid) : null;
    const did = req.query.did != null ? Number(req.query.did) : null;

    const where = [];
    const params = [season];
    let idx = 2;

    if (cid != null && Number.isFinite(cid)) {
      where.push(`t.cid = $${idx++}`);
      params.push(cid);
    }
    if (did != null && Number.isFinite(did)) {
      where.push(`t.did = $${idx++}`);
      params.push(did);
    }

    const filterSql = where.length ? `AND ${where.join(" AND ")}` : "";

    const res = await q(
      `
      SELECT
        t.tid, t.cid, t.did, t.region, t.name, t.abbrev, t.img_url,
        ts.won, ts.lost,
        ts.won_conf, ts.lost_conf,
        ts.won_div, ts.lost_div,
        ts.streak, ts.hype
      FROM team_seasons ts
      JOIN teams t ON t.tid = ts.tid
      WHERE ts.season = $1 AND t.tid >= 0
      ${filterSql}
      ORDER BY
        (ts.won::float / NULLIF(ts.won + ts.lost, 0)) DESC NULLS LAST,
        ts.won DESC,
        t.region, t.name
      `,
      params
    );

    return { season, cid, did, standings: res.rows };
  });
}
