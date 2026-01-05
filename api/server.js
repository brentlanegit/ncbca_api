import Fastify from "fastify";
import cors from "@fastify/cors";

import metaRoutes from "./routes/meta.js";
import teamRoutes from "./routes/teams.js";
import playerRoutes from "./routes/players.js";
import scheduleRoutes from "./routes/schedule.js";
import gameRoutes from "./routes/games.js";
import standingsRoutes from "./routes/standings.js";
import leadersRoutes from "./routes/leaders.js";


const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  credentials: true,
});

app.get("/health", async () => ({ status: "ok" }));

// DB check
import { one } from "./lib/db.js";
app.get("/db-check", async () => {
  const r = await one("SELECT 1 as ok");
  return { db: "ok", result: r };
});

// Routes (prefixed under /api)
await app.register(metaRoutes, { prefix: "/api" });
await app.register(teamRoutes, { prefix: "/api" });
await app.register(playerRoutes, { prefix: "/api" });
await app.register(scheduleRoutes, { prefix: "/api" });
await app.register(gameRoutes, { prefix: "/api" });
await app.register(standingsRoutes, { prefix: "/api" });
await app.register(leadersRoutes, { prefix: "/api" });


const port = 3000;
app.listen({ port, host: "0.0.0.0" });
