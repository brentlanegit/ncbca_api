/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
export async function up(pgm) {
  // Helpful extension for UUID generation
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  // ---- exports (raw import history) ----
  pgm.createTable("exports", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },

    // Basic metadata about the import
    season: { type: "int", notNull: false },
    file_name: { type: "text", notNull: false },
    file_sha256: { type: "text", notNull: false, unique: true },

    // Where the raw export backup lives (local path now; later: R2 URL/key)
    storage_key: { type: "text", notNull: true },

    // Mark which export is "active" for serving data
    is_active: { type: "boolean", notNull: true, default: false }
  });

  pgm.createIndex("exports", ["created_at"]);
  pgm.createIndex("exports", ["season"]);
  pgm.createIndex("exports", ["is_active"]);

  // ---- teams (base identity) ----
  pgm.createTable("teams", {
    tid: { type: "int", primaryKey: true },
    cid: { type: "int", notNull: true },
    did: { type: "int", notNull: true },

    region: { type: "text", notNull: true },
    name: { type: "text", notNull: true },
    abbrev: { type: "text", notNull: true },

    img_url: { type: "text", notNull: false },
    colors: { type: "jsonb", notNull: false },
    jersey: { type: "text", notNull: false },

    disabled: { type: "boolean", notNull: true, default: false },

    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") }
  });

  pgm.createIndex("teams", ["abbrev"]);
  pgm.createIndex("teams", ["cid"]);
  pgm.createIndex("teams", ["did"]);

  // ---- team seasons (record + season snapshot) ----
  pgm.createTable("team_seasons", {
    tid: { type: "int", notNull: true, references: "teams(tid)", onDelete: "cascade" },
    season: { type: "int", notNull: true },

    won: { type: "int", notNull: true, default: 0 },
    lost: { type: "int", notNull: true, default: 0 },

    won_conf: { type: "int", notNull: false },
    lost_conf: { type: "int", notNull: false },
    won_div: { type: "int", notNull: false },
    lost_div: { type: "int", notNull: false },

    streak: { type: "int", notNull: false },
    hype: { type: "float", notNull: false },

    rid: { type: "int", notNull: false } // row id from export
  });

  pgm.addConstraint("team_seasons", "team_seasons_pk", {
    primaryKey: ["tid", "season"]
  });

  pgm.createIndex("team_seasons", ["season"]);

  // ---- team stats (season totals) ----
  pgm.createTable("team_stats", {
    tid: { type: "int", notNull: true, references: "teams(tid)", onDelete: "cascade" },
    season: { type: "int", notNull: true },
    playoffs: { type: "boolean", notNull: true, default: false },

    gp: { type: "int", notNull: true, default: 0 },
    min: { type: "float", notNull: false },

    fg: { type: "int", notNull: false },
    fga: { type: "int", notNull: false },
    tp: { type: "int", notNull: false },
    tpa: { type: "int", notNull: false },
    ft: { type: "int", notNull: false },
    fta: { type: "int", notNull: false },

    orb: { type: "int", notNull: false },
    drb: { type: "int", notNull: false },
    ast: { type: "int", notNull: false },
    tov: { type: "int", notNull: false },
    stl: { type: "int", notNull: false },
    blk: { type: "int", notNull: false },
    pf: { type: "int", notNull: false },
    pts: { type: "int", notNull: false },

    opp_pts: { type: "int", notNull: false }
  });

  pgm.addConstraint("team_stats", "team_stats_pk", {
    primaryKey: ["tid", "season", "playoffs"]
  });

  pgm.createIndex("team_stats", ["season", "playoffs"]);

  // ---- players (identity) ----
  pgm.createTable("players", {
    pid: { type: "int", primaryKey: true },

    first_name: { type: "text", notNull: true },
    last_name: { type: "text", notNull: true },

    born_year: { type: "int", notNull: false },
    born_loc: { type: "text", notNull: false },

    hgt_in: { type: "int", notNull: false },
    img_url: { type: "text", notNull: false },

    // Current injury status (for quick display)
    injury: { type: "jsonb", notNull: false },

    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") }
  });

  pgm.createIndex("players", ["last_name"]);
  pgm.createIndex("players", ["first_name"]);

  // ---- player ratings by season ----
  pgm.createTable("player_ratings", {
    pid: { type: "int", notNull: true, references: "players(pid)", onDelete: "cascade" },
    season: { type: "int", notNull: true },

    pos: { type: "text", notNull: false },
    ovr: { type: "int", notNull: false },
    pot: { type: "int", notNull: false },
    skills: { type: "jsonb", notNull: false },

    // Store full ratings blob (stre/spd/jmp/etc) for future features
    ratings: { type: "jsonb", notNull: true }
  });

  pgm.addConstraint("player_ratings", "player_ratings_pk", {
    primaryKey: ["pid", "season"]
  });

  pgm.createIndex("player_ratings", ["season"]);
  pgm.createIndex("player_ratings", ["ovr"]);
  pgm.createIndex("player_ratings", ["pot"]);

  // ---- player stats by season (for roster + player page) ----
  pgm.createTable("player_stats", {
    pid: { type: "int", notNull: true, references: "players(pid)", onDelete: "cascade" },
    season: { type: "int", notNull: true },
    playoffs: { type: "boolean", notNull: true, default: false },
    tid: { type: "int", notNull: true, references: "teams(tid)", onDelete: "restrict" },

    gp: { type: "int", notNull: false },
    gs: { type: "int", notNull: false },
    min: { type: "float", notNull: false },

    pts: { type: "int", notNull: false },
    orb: { type: "int", notNull: false },
    drb: { type: "int", notNull: false },
    ast: { type: "int", notNull: false },
    tov: { type: "int", notNull: false },
    stl: { type: "int", notNull: false },
    blk: { type: "int", notNull: false },

    // Keep original blob for advanced metrics later (PER, BPM, etc)
    stats: { type: "jsonb", notNull: true }
  });

  pgm.addConstraint("player_stats", "player_stats_pk", {
    primaryKey: ["pid", "season", "playoffs"]
  });

  pgm.createIndex("player_stats", ["season", "playoffs"]);
  pgm.createIndex("player_stats", ["tid", "season", "playoffs"]);

  // ---- schedule (future games only in your league) ----
  pgm.createTable("schedule", {
    gid: { type: "int", primaryKey: true },
    season: { type: "int", notNull: true },
    day: { type: "int", notNull: true },

    home_tid: { type: "int", notNull: true, references: "teams(tid)", onDelete: "restrict" },
    away_tid: { type: "int", notNull: true, references: "teams(tid)", onDelete: "restrict" }
  });

  pgm.createIndex("schedule", ["season", "day"]);
  pgm.createIndex("schedule", ["home_tid"]);
  pgm.createIndex("schedule", ["away_tid"]);

  // ---- games (played games) ----
  pgm.createTable("games", {
    gid: { type: "int", primaryKey: true },
    season: { type: "int", notNull: true },
    day: { type: "int", notNull: true },

    home_tid: { type: "int", notNull: true, references: "teams(tid)", onDelete: "restrict" },
    away_tid: { type: "int", notNull: true, references: "teams(tid)", onDelete: "restrict" },

    home_pts: { type: "int", notNull: true },
    away_pts: { type: "int", notNull: true },

    num_periods: { type: "int", notNull: false },
    overtimes: { type: "int", notNull: false }
  });

  pgm.createIndex("games", ["season", "day"]);
  pgm.createIndex("games", ["home_tid"]);
  pgm.createIndex("games", ["away_tid"]);

  // ---- game team totals (2 rows per game) ----
  pgm.createTable("game_team_totals", {
    gid: { type: "int", notNull: true, references: "games(gid)", onDelete: "cascade" },
    tid: { type: "int", notNull: true, references: "teams(tid)", onDelete: "restrict" },
    is_home: { type: "boolean", notNull: true },

    totals: { type: "jsonb", notNull: true }
  });

  pgm.addConstraint("game_team_totals", "game_team_totals_pk", {
    primaryKey: ["gid", "tid"]
  });

  pgm.createIndex("game_team_totals", ["tid"]);

  // ---- game player lines (box score lines) ----
  pgm.createTable("game_player_lines", {
    gid: { type: "int", notNull: true, references: "games(gid)", onDelete: "cascade" },
    tid: { type: "int", notNull: true, references: "teams(tid)", onDelete: "restrict" },
    pid: { type: "int", notNull: true },

    is_home: { type: "boolean", notNull: true },
    gs: { type: "int", notNull: false },

    // store key fields duplicated for easy sorting/filtering
    min: { type: "float", notNull: false },
    pts: { type: "int", notNull: false },
    orb: { type: "int", notNull: false },
    drb: { type: "int", notNull: false },
    ast: { type: "int", notNull: false },

    // keep the full line
    line: { type: "jsonb", notNull: true }
  });

  pgm.addConstraint("game_player_lines", "game_player_lines_pk", {
    primaryKey: ["gid", "pid"]
  });

  pgm.createIndex("game_player_lines", ["tid"]);
  pgm.createIndex("game_player_lines", ["pid"]);
}

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
export async function down(pgm) {
  // Drop in reverse dependency order
  pgm.dropTable("game_player_lines");
  pgm.dropTable("game_team_totals");
  pgm.dropTable("games");
  pgm.dropTable("schedule");

  pgm.dropTable("player_stats");
  pgm.dropTable("player_ratings");
  pgm.dropTable("players");

  pgm.dropTable("team_stats");
  pgm.dropTable("team_seasons");
  pgm.dropTable("teams");

  pgm.dropTable("exports");
}
