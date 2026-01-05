/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
export async function up(pgm) {
  // ---- league_meta ----
  pgm.createTable("league_meta", {
    export_id: {
      type: "uuid",
      primaryKey: true,
      references: "exports(id)",
      onDelete: "cascade",
    },
    season: { type: "int", notNull: true },
    phase: { type: "int", notNull: true },
    starting_season: { type: "int", notNull: false },
    meta: { type: "jsonb", notNull: true },
  });

  pgm.createIndex("league_meta", ["season"]);
  pgm.createIndex("league_meta", ["phase"]);

  // ---- conferences ----
  pgm.createTable("conferences", {
    cid: { type: "int", primaryKey: true },
    name: { type: "text", notNull: true },
  });

  // ---- divisions ----
  pgm.createTable("divisions", {
    did: { type: "int", primaryKey: true },
    cid: {
      type: "int",
      notNull: true,
      references: "conferences(cid)",
      onDelete: "restrict",
    },
    name: { type: "text", notNull: true },
  });

  pgm.createIndex("divisions", ["cid"]);

  // ---- player_awards ----
  pgm.createTable("player_awards", {
    pid: {
      type: "int",
      notNull: true,
      references: "players(pid)",
      onDelete: "cascade",
    },
    season: { type: "int", notNull: true },
    type: { type: "text", notNull: true },
    details: { type: "jsonb", notNull: false },
  });

  pgm.addConstraint("player_awards", "player_awards_pk", {
    primaryKey: ["pid", "season", "type"],
  });

  pgm.createIndex("player_awards", ["season"]);
  pgm.createIndex("player_awards", ["type"]);

  // ---- players: add class_year (draft.year in your export) ----
  pgm.addColumn("players", {
    class_year: { type: "int", notNull: false },
  });

  pgm.createIndex("players", ["class_year"]);
}

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
export async function down(pgm) {
  pgm.dropIndex("players", ["class_year"]);
  pgm.dropColumn("players", "class_year");

  pgm.dropTable("player_awards");
  pgm.dropTable("divisions");
  pgm.dropTable("conferences");
  pgm.dropTable("league_meta");
}
