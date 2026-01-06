import { getActiveMeta } from "../lib/meta.js";
import { q } from "../lib/db.js";

export default async function metaRoutes(app) {
  app.get("/meta", async () => {
    const meta = await getActiveMeta();
    if (!meta) return { error: "No active export. Import a league export first." };

    const confs = await q(`SELECT cid, name FROM conferences ORDER BY cid`);
    const divs = await q(`SELECT did, cid, name FROM divisions ORDER BY cid, did`);

    return {
      exportId: meta.export_id,
      season: meta.season,
      phase: meta.phase,
      startingSeason: meta.starting_season,
      conferences: confs.rows,
      divisions: divs.rows,
    };
  });

  app.get("/exports", async () => {
    const res = await q(
      `
      SELECT
        e.id,
        e.created_at,
        e.season,
        e.file_name,
        e.is_active,
        lm.phase,
        lm.starting_season
      FROM exports e
      LEFT JOIN league_meta lm ON lm.export_id = e.id
      ORDER BY e.created_at DESC
      `
    );

    return { exports: res.rows };
  });
}
