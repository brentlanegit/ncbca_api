import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes,
  StringSelectMenuBuilder,
} from "discord.js";
import { importLeagueFromFile } from "../api/import/importLeague.js";
import { renderFaceThumbnail } from "./renderFace.js";

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const apiBaseUrl = process.env.API_BASE_URL ?? "http://api:3000";

if (!token || !appId) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_APPLICATION_ID.");
  process.exit(1);
}

const commandDefinitions = [
  {
    name: "loadexport",
    description: "Load a BasketballGM export from a URL",
    default_member_permissions: PermissionsBitField.Flags.ManageWebhooks.toString(),
    options: [
      {
        name: "url",
        description: "Direct link to the export JSON",
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: "player",
    description: "Show a player card",
    options: [
      {
        name: "name",
        description: "Player name",
        type: 3,
        required: true,
        autocomplete: true,
      },
    ],
  },
];

const rest = new REST({ version: "10" }).setToken(token);

async function registerCommands() {
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(appId, guildId), {
      body: commandDefinitions,
    });
    console.log(`Registered guild commands for ${guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(appId), { body: commandDefinitions });
    console.log("Registered global commands");
  }
}

async function downloadExport(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download export (HTTP ${response.status})`);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ncbca-export-"));
  const filePath = path.join(tempDir, "export.json");
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, buffer);
  return filePath;
}

function isAuthorized(interaction) {
  const perms = interaction.member?.permissions;
  if (!perms) return false;
  return perms.has(PermissionsBitField.Flags.ManageWebhooks);
}

async function apiGet(pathname) {
  const res = await fetch(`${apiBaseUrl}${pathname}`);
  if (!res.ok) {
    throw new Error(`API ${pathname} failed (${res.status})`);
  }
  return res.json();
}

function formatInjury(injury) {
  if (!injury) return "Healthy";
  const gamesRemaining = injury.gamesRemaining ?? injury.games_remaining;
  if (gamesRemaining == null) return "Injured";
  return `Injured (${gamesRemaining} games)`;
}

function formatHeight(hgtIn) {
  if (typeof hgtIn !== "number") return "Unknown";
  const feet = Math.floor(hgtIn / 12);
  const inches = hgtIn % 12;
  return `${feet}'${inches}"`;
}

function formatWeight(weightLbs) {
  if (typeof weightLbs !== "number") return "Unknown";
  return `${weightLbs} lbs`;
}

function formatTeamLabel(team) {
  if (!team) return "Unknown";
  return `${team.region} ${team.name}`;
}

function formatStatValue(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return "N/A";
  return Number(value).toFixed(digits);
}

function computeSplit(made, attempted) {
  if (typeof made !== "number" || typeof attempted !== "number" || attempted <= 0) return "N/A";
  return `${((made / attempted) * 100).toFixed(1)}%`;
}

function sumSeasonStats(stats) {
  return stats.reduce(
    (acc, s) => {
      acc.gp += s.gp ?? 0;
      acc.min += s.min ?? 0;
      acc.pts += s.pts ?? 0;
      acc.orb += s.orb ?? 0;
      acc.drb += s.drb ?? 0;
      acc.ast += s.ast ?? 0;
      acc.stl += s.stl ?? 0;
      acc.blk += s.blk ?? 0;
      acc.tov += s.tov ?? 0;
      return acc;
    },
    { gp: 0, min: 0, pts: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0 }
  );
}

function perGameTotals(totals) {
  if (!totals.gp) return {};
  return {
    pts: totals.pts / totals.gp,
    reb: (totals.orb + totals.drb) / totals.gp,
    ast: totals.ast / totals.gp,
    stl: totals.stl / totals.gp,
    blk: totals.blk / totals.gp,
  };
}

function buildPlayerHeader(player, rating) {
  const classLabel = player.class_year_label ?? "Unknown";
  const ovr = rating?.ovr ?? "N/A";
  const pot = rating?.pot ?? "N/A";
  return `**${player.first_name} ${player.last_name}** • ${classLabel} • OVR ${ovr} / POT ${pot}`;
}

async function loadPlayerBundle(pid) {
  const playerData = await apiGet(`/api/player/${pid}`);
  const seasonsData = await apiGet(`/api/player/${pid}/seasons`);
  const rawData = await apiGet(`/api/player/${pid}/raw`);
  const teams = await apiGet("/api/teams?includeSystem=true");
  const teamMap = new Map(teams.map((t) => [t.tid, t]));

  let team = null;
  if (typeof playerData.player.current_tid === "number" && playerData.player.current_tid >= 0) {
    const teamData = await apiGet(`/api/team/${playerData.player.current_tid}`);
    team = teamData.team;
  } else if (typeof playerData.player.current_tid === "number") {
    team = teamMap.get(playerData.player.current_tid) ?? null;
  }

  return { playerData, seasonsData, rawData, team, teamMap };
}

function buildPlayerEmbedBio({ playerData, team }) {
  const { player, rating, stats } = playerData;
  const faceUrl = renderFaceThumbnail(player.face);
  const authorIcon = team?.img_url;
  const authorName =
    player.current_tid === -2 || player.current_tid === -3
      ? "High School"
      : formatTeamLabel(team);

  const bioStats = stats?.stats ?? {};
  const splits = [
    `FG: ${computeSplit(bioStats.fg, bioStats.fga)}`,
    `3P: ${computeSplit(bioStats.tp, bioStats.tpa)}`,
    `FT: ${computeSplit(bioStats.ft, bioStats.fta)}`,
  ].join(" | ");

  const advanced = [
    `PER: ${formatStatValue(bioStats.per)}`,
    `BPM: ${formatStatValue(bioStats.bpm)}`,
    `WS: ${formatStatValue(bioStats.ws)}`,
    `VORP: ${formatStatValue(bioStats.vorp)}`,
  ].join(" | ");

  return {
    embeds: [
      {
        author: {
          name: authorName,
          icon_url:
            player.current_tid === -2 || player.current_tid === -3
              ? "https://upload.wikimedia.org/wikipedia/en/thumb/5/51/National_Federation_of_State_High_School_Associations_logo.svg/1032px-National_Federation_of_State_High_School_Associations_logo.svg.png"
              : authorIcon ?? undefined,
        },
        title: buildPlayerHeader(player, rating),
        thumbnail: faceUrl ? { url: faceUrl } : undefined,
        fields: [
          {
            name: "Bio",
            value: [
              `Height: ${formatHeight(player.hgt_in)}`,
              `Weight: ${formatWeight(player.weight_lbs)}`,
              `Born: ${player.born_year ?? "Unknown"} (${player.born_loc ?? "Unknown"})`,
              `College: ${player.college ?? "Unknown"}`,
              `HS Grad Year: ${player.class_year ?? "Unknown"}`,
              `Injury: ${formatInjury(player.injury)}`,
            ].join("\n"),
          },
          {
            name: "Current Season Stats",
            value: [
              `GP: ${stats?.gp ?? "N/A"} | MIN: ${formatStatValue(stats?.min)}`,
              `PTS: ${stats?.pts ?? "N/A"} | REB: ${stats ? stats.orb + stats.drb : "N/A"} | AST: ${stats?.ast ?? "N/A"}`,
              `STL: ${stats?.stl ?? "N/A"} | BLK: ${stats?.blk ?? "N/A"} | TOV: ${stats?.tov ?? "N/A"}`,
              splits,
              advanced,
            ].join("\n"),
          },
        ],
        footer: { text: `PID ${player.pid}` },
      },
    ],
  };
}

function buildPlayerEmbedCareer({ playerData, seasonsData, teamMap }) {
  const { player, rating } = playerData;
  const seasons = seasonsData.seasons.filter((s) => !s.playoffs);
  const totals = sumSeasonStats(seasons);
  const perGame = perGameTotals(totals);

  const seasonLines = seasons
    .slice(0, 10)
    .map((s) => {
      const team = teamMap.get(s.tid);
      const teamLabel = team ? team.abbrev : `T${s.tid}`;
      return `${s.season} ${teamLabel} — GP ${s.gp} | PTS ${s.pts} | REB ${
        s.orb + s.drb
      } | AST ${s.ast}`;
    });

  const awards = playerData.awards?.length
    ? playerData.awards.map((a) => `${a.season} ${a.type}`).slice(0, 10)
    : ["None"];

  return {
    embeds: [
      {
        title: buildPlayerHeader(player, rating),
        fields: [
          {
            name: "Career Per Game",
            value: [
              `PTS: ${formatStatValue(perGame.pts)}`,
              `REB: ${formatStatValue(perGame.reb)}`,
              `AST: ${formatStatValue(perGame.ast)}`,
              `STL: ${formatStatValue(perGame.stl)}`,
              `BLK: ${formatStatValue(perGame.blk)}`,
            ].join(" | "),
          },
          {
            name: "Career Totals",
            value: [
              `GP: ${totals.gp}`,
              `PTS: ${totals.pts}`,
              `REB: ${totals.orb + totals.drb}`,
              `AST: ${totals.ast}`,
              `STL: ${totals.stl}`,
              `BLK: ${totals.blk}`,
            ].join(" | "),
          },
          {
            name: "Season Stats (Most Recent 10)",
            value: seasonLines.length ? seasonLines.join("\n") : "No seasons recorded",
          },
          {
            name: "Awards",
            value: awards.join("\n"),
          },
        ],
        footer: { text: `PID ${player.pid}` },
      },
    ],
  };
}

function buildRatingsTable(current, previous) {
  const keys = [
    "hgt",
    "stre",
    "spd",
    "jmp",
    "endu",
    "ins",
    "dnk",
    "ft",
    "fg",
    "tp",
    "oiq",
    "diq",
    "drb",
    "pss",
    "reb",
  ];

  return keys
    .map((key) => {
      const cur = current?.[key];
      if (typeof cur !== "number") return null;
      const prev = previous?.[key];
      const delta =
        typeof prev === "number" ? `${cur} (${cur - prev >= 0 ? "+" : ""}${cur - prev})` : `${cur}`;
      return `${key.toUpperCase()}: ${delta}`;
    })
    .filter(Boolean);
}

function buildPlayerEmbedRatings({ playerData, rawData }) {
  const { player, rating } = playerData;
  const ratings = rawData.ratings ?? [];
  const current = ratings[ratings.length - 1]?.ratings ?? ratings[ratings.length - 1];
  const previous = ratings[ratings.length - 2]?.ratings ?? ratings[ratings.length - 2];
  const skills = rating?.skills?.length ? rating.skills.join(", ") : "None";
  const ratingLines = buildRatingsTable(current, previous);

  return {
    embeds: [
      {
        title: buildPlayerHeader(player, rating),
        fields: [
          { name: "Skills", value: skills },
          {
            name: "Ratings (Current vs Previous)",
            value: ratingLines.length ? ratingLines.join("\n") : "Ratings not available",
          },
        ],
        footer: { text: `PID ${player.pid}` },
      },
    ],
  };
}

function buildPaginationRow(active) {
  const pages = [
    { id: "bio", label: "Bio" },
    { id: "career", label: "Career" },
    { id: "ratings", label: "Ratings" },
  ];
  const buttons = pages.map((page) =>
    new ButtonBuilder()
      .setCustomId(`player:${page.id}`)
      .setLabel(page.label)
      .setStyle(active === page.id ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
  return new ActionRowBuilder().addComponents(buttons);
}

async function buildPlayerMessage(pid, page) {
  const bundle = await loadPlayerBundle(pid);
  if (page === "career") {
    return {
      ...buildPlayerEmbedCareer(bundle),
      components: [buildPaginationRow(page)],
    };
  }
  if (page === "ratings") {
    return {
      ...buildPlayerEmbedRatings(bundle),
      components: [buildPaginationRow(page)],
    };
  }
  return {
    ...buildPlayerEmbedBio(bundle),
    components: [buildPaginationRow(page)],
  };
}

function buildPlayerSelect(matches, teamMap) {
  const options = matches.slice(0, 25).map((p) => {
    const team = teamMap.get(p.current_tid);
    const teamLabel = team ? team.abbrev : p.current_tid < 0 ? "HS" : "FA";
    const classLabel = p.class_year_label ?? "Unknown";
    const label = `${p.first_name} ${p.last_name} — ${teamLabel} — ${classLabel}`;
    const description = p.class_year ? `HS Grad ${p.class_year}` : "No grad year";
    return {
      label: label.slice(0, 100),
      description: description.slice(0, 100),
      value: String(p.pid),
    };
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId("player:select")
    .setPlaceholder("Select a player")
    .addOptions(options);

  return new ActionRowBuilder().addComponents(menu);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`Bot logged in as ${client.user?.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) {
    if (interaction.commandName !== "player") return;
    const query = interaction.options.getString("name") ?? "";
    if (!query.trim()) {
      await interaction.respond([]);
      return;
    }
    try {
      const matches = await apiGet(`/api/players/search?q=${encodeURIComponent(query.trim())}`);
      await interaction.respond(
        matches.slice(0, 25).map((p) => ({
          name: `${p.first_name} ${p.last_name}`,
          value: String(p.pid),
        }))
      );
    } catch (err) {
      console.error("Autocomplete failed:", err);
      await interaction.respond([]);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "loadexport") {
    if (!isAuthorized(interaction)) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    const url = interaction.options.getString("url", true).trim();
    await interaction.deferReply({ ephemeral: false });

    try {
      const filePath = await downloadExport(url);
      const summary = await importLeagueFromFile(filePath);

      const message = [
        "✅ Export imported successfully.",
        `Season: ${summary.currentSeason}`,
        `Phase: ${summary.phase}`,
        `Teams: ${summary.teams}`,
        `Players: ${summary.players}`,
        `Schedule: ${summary.schedule}`,
        `Games: ${summary.games}`,
        `Export ID: ${summary.exportId}`,
      ].join("\n");

      await interaction.editReply(message);
    } catch (err) {
      console.error("Import failed:", err);
      await interaction.editReply(`❌ Import failed: ${err.message ?? "Unknown error"}`);
    }
    return;
  }

  if (interaction.commandName === "player") {
    const nameInput = interaction.options.getString("name", true).trim();
    await interaction.deferReply({ ephemeral: false });

    try {
      const matches = await apiGet(`/api/players/search?q=${encodeURIComponent(nameInput)}`);
      if (!matches.length) {
        await interaction.editReply("No players found.");
        return;
      }

      const teams = await apiGet("/api/teams?includeSystem=true");
      const teamMap = new Map(teams.map((t) => [t.tid, t]));

      if (matches.length === 1) {
        const message = await buildPlayerMessage(matches[0].pid, "bio");
        await interaction.editReply(message);
        return;
      }

      const row = buildPlayerSelect(matches, teamMap);
      await interaction.editReply({
        content: "Multiple players found. Select one:",
        components: [row],
      });
    } catch (err) {
      console.error("Player lookup failed:", err);
      await interaction.editReply(`❌ Player lookup failed: ${err.message ?? "Unknown error"}`);
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId !== "player:select") return;
    const pid = Number(interaction.values[0]);
    if (!Number.isFinite(pid)) return;
    await interaction.deferUpdate();
    const message = await buildPlayerMessage(pid, "bio");
    await interaction.editReply(message);
    return;
  }

  if (interaction.isButton()) {
    const [prefix, page] = interaction.customId.split(":");
    if (prefix !== "player") return;
    const footer = interaction.message?.embeds?.[0]?.footer?.text;
    const pidValue = footer ? Number(footer.replace("PID ", "")) : NaN;
    if (!Number.isFinite(pidValue)) {
      await interaction.reply({ content: "Unable to determine player.", ephemeral: true });
      return;
    }

    await interaction.deferUpdate();
    const message = await buildPlayerMessage(pidValue, page);
    await interaction.editReply(message);
  }
});

await registerCommands();
client.login(token);
