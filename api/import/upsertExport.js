export async function createExportRow(client, { season, fileName, hash, storageKey }) {
  // Insert export record (hash unique)
  const ins = await client.query(
    `
    INSERT INTO exports (season, file_name, file_sha256, storage_key, is_active)
    VALUES ($1, $2, $3, $4, false)
    ON CONFLICT (file_sha256) DO UPDATE
      SET season = EXCLUDED.season,
          file_name = EXCLUDED.file_name,
          storage_key = EXCLUDED.storage_key
    RETURNING id
    `,
    [season ?? null, fileName ?? null, hash, storageKey]
  );

  return ins.rows[0].id;
}

export async function setActiveExport(client, exportId) {
  await client.query(`UPDATE exports SET is_active = false WHERE is_active = true`);
  await client.query(`UPDATE exports SET is_active = true WHERE id = $1`, [exportId]);
}
