import { importLeagueFromFile } from "./importLeague.js";

function usage() {
  console.log("Usage: npm run import:local -- <path-to-export.json>");
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    usage();
    process.exit(1);
  }

  const summary = await importLeagueFromFile(filePath);

  console.log("✅ Import complete:");
  console.log(summary);
}

main().catch((err) => {
  console.error("❌ Import failed:", err);
  process.exit(1);
});
