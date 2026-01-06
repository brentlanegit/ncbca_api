/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
export async function up(pgm) {
  pgm.addColumn("players", {
    class_year_label: { type: "text", notNull: false },
  });
}

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
export async function down(pgm) {
  pgm.dropColumn("players", "class_year_label");
}
