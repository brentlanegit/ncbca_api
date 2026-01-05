import http from "http";
import pg from "pg";

const { Pool } = pg;

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const server = http.createServer(async (req, res) => {
  // ---- health check (no DB) ----
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // ---- database check ----
  if (req.url === "/db-check") {
    try {
      const result = await pool.query("SELECT 1");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ db: "ok", result: result.rows[0] }));
    } catch (err) {
      console.error("DB check failed:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          db: "error",
          message: err.message
        })
      );
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(3000, () => {
  console.log("API running on http://localhost:3000");
});
