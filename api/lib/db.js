import pg from "pg";
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function q(text, params = []) {
  const res = await pool.query(text, params);
  return res;
}

export async function one(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows[0] ?? null;
}
