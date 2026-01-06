/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
export async function up(pgm) {
  pgm.createTable("gid_conflicts", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },

    gid: { type: "int", notNull: true },

    existing_season: { type: "int", notNull: false },
    existing_home_tid: { type: "int", notNull: false },
    existing_away_tid: { type: "int", notNull: false },

    incoming_season: { type: "int", notNull: false },
    incoming_home_tid: { type: "int", notNull: false },
    incoming_away_tid: { type: "int", notNull: false },

    existing_game: { type: "jsonb", notNull: true },
    incoming_game: { type: "jsonb", notNull: true },
  });

  pgm.createIndex("gid_conflicts", ["gid"]);
  pgm.createIndex("gid_conflicts", ["created_at"]);
}

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
export async function down(pgm) {
  pgm.dropTable("gid_conflicts");
}
