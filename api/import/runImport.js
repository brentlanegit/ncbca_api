import { loadExportFromFile, persistRawExport } from "./loadExport.js";
import { withTransaction } from "./db.js";
import { createExportRow, setActiveExport } from "./upsertExport.js";
import { upsertLeagueMeta, upsertConfsDivs } from "./upsertLeagueMeta.js";
import { upsertTeams, upsertTeamSeasons, upsertTeamStats } from "./upsertTeams.js";
import { upsertPlayers, upsertPlayerRatings, upsertPlayerStats, upsertPlayerAwards } from "./upsertPlayers.js";
import { upsertSchedule } from "./upsertSchedule.js";
import { upsertGames } from "./upsertGames.js";
import { ensureSpecialTeams } from "./ensureSpecialTeams.js";

function usage() {
  console.log("Usage: npm run import:local -- <path-to-export.json>");
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    usage();
    process.exit(1);
  }

  const { raw, hash, json } = loadExportFromFile(filePath);
  const { storageKey, fileName } = persistRawExport({ raw, hash });

  const gameAttributes = json.gameAttributes;
  const season = gameAttributes.season;

  const summary = await withTransaction(async (client) => {
    // 1) exports row + active pointer
    const exportId = await createExportRow(client, {
      season,
      fileName,
      hash,
      storageKey,
    });
    await setActiveExport(client, exportId);

    // 2) meta + conf/div
    const { season: currentSeason, phase } = await upsertLeagueMeta(client, exportId, gameAttributes);
    await upsertConfsDivs(client, gameAttributes);

    // 3) teams (latest identity always updated)
    await upsertTeams(client, json.teams);
    await ensureSpecialTeams(client);

    // Archive mode: update ONLY current season rows, preserve past seasons
    await upsertTeamSeasons(client, json.teams, currentSeason);
    await upsertTeamStats(client, json.teams, currentSeason);

    // 4) players (latest bio always updated)
    await upsertPlayers(client, json.players, currentSeason);

    // Archive mode: update ONLY current season ratings/stats, preserve past seasons
    await upsertPlayerRatings(client, json.players, currentSeason);
    await upsertPlayerStats(client, json.players, currentSeason);
    await upsertPlayerAwards(client, json.players);

    // 5) schedule: snapshot replacement per season (future games only)
    await upsertSchedule(client, json.schedule, currentSeason);

    // 6) games + box scores (archive mode patched in upsertGames.js)
    await upsertGames(client, json.games);

    return {
      exportId,
      hash,
      storageKey,
      currentSeason,
      phase,
      teams: json.teams.length,
      players: json.players.length,
      schedule: json.schedule.length,
      games: json.games.length,
    };
  });

  console.log("✅ Import complete:");
  console.log(summary);
}

main().catch((err) => {
  console.error("❌ Import failed:", err);
  process.exit(1);
});
