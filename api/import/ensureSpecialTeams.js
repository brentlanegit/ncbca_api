export async function ensureSpecialTeams(client) {
  const specials = [
    { tid: -1, cid: 0, did: 0, region: "Transfers", name: "Pool", abbrev: "XFER", disabled: true },
    { tid: -2, cid: 0, did: 0, region: "Prospects", name: "Pool", abbrev: "PROS", disabled: true },
    { tid: -3, cid: 0, did: 0, region: "Graduated", name: "Pool", abbrev: "GRAD", disabled: true },
  ];

  for (const t of specials) {
    await client.query(
      `
      INSERT INTO teams (tid, cid, did, region, name, abbrev, img_url, colors, jersey, disabled, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL,NULL,$7, now())
      ON CONFLICT (tid) DO UPDATE SET
        cid=EXCLUDED.cid,
        did=EXCLUDED.did,
        region=EXCLUDED.region,
        name=EXCLUDED.name,
        abbrev=EXCLUDED.abbrev,
        disabled=EXCLUDED.disabled,
        updated_at=now()
      `,
      [t.tid, t.cid, t.did, t.region, t.name, t.abbrev, t.disabled]
    );
  }
}
