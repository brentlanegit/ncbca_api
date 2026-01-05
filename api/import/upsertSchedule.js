export async function upsertSchedule(client, schedule, season) {
  // Replace schedule snapshot for this season (future games only)
  await client.query(`DELETE FROM schedule WHERE season = $1`, [season]);

  for (const g of schedule) {
    await client.query(
      `
      INSERT INTO schedule (gid, season, day, home_tid, away_tid)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (gid) DO UPDATE SET
        season=EXCLUDED.season,
        day=EXCLUDED.day,
        home_tid=EXCLUDED.home_tid,
        away_tid=EXCLUDED.away_tid
      `,
      [g.gid, season, g.day ?? 0, g.homeTid, g.awayTid]
    );
  }
}
