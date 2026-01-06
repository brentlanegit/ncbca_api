import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from "discord.js";
import { renderFacePngAttachment } from "../renderFace.js";

const HIGH_SCHOOL_LOGO =
  "https://upload.wikimedia.org/wikipedia/en/thumb/5/51/National_Federation_of_State_High_School_Associations_logo.svg/1032px-National_Federation_of_State_High_School_Associations_logo.svg.png";

async function apiGet(apiBaseUrl, pathname) {
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

function isValidEmbedUrl(url) {
  if (typeof url !== "string" || !url.trim()) return false;
  if (url.startsWith("attachment://")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatStatValue(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(value).toFixed(digits);
}

function formatLabeledStat(value, label, digits = 1) {
  const formatted = formatStatValue(value, digits);
  return formatted == null ? `N/A ${label}` : `${formatted} ${label}`;
}

function perGame(value, gp) {
  if (!gp || value == null) return null;
  return value / gp;
}

function computeSplit(made, attempted) {
  if (typeof made !== "number" || typeof attempted !== "number" || attempted <= 0) return null;
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

async function loadPlayerBundle(apiBaseUrl, pid) {
  const playerData = await apiGet(apiBaseUrl, `/api/player/${pid}`);
  const seasonsData = await apiGet(apiBaseUrl, `/api/player/${pid}/seasons`);
  const rawData = await apiGet(apiBaseUrl, `/api/player/${pid}/raw`);
  const teams = await apiGet(apiBaseUrl, "/api/teams?includeSystem=true");
  const teamMap = new Map(teams.map((t) => [t.tid, t]));

  let team = null;
  if (typeof playerData.player.current_tid === "number" && playerData.player.current_tid >= 0) {
    const teamData = await apiGet(apiBaseUrl, `/api/team/${playerData.player.current_tid}`);
    team = teamData.team;
  } else if (typeof playerData.player.current_tid === "number") {
    team = teamMap.get(playerData.player.current_tid) ?? null;
  }

  return { playerData, seasonsData, rawData, team, teamMap };
}

function buildPlayerEmbedBio({ playerData, team, thumbnailUrl }) {
  const { player, rating, stats } = playerData;
  const authorIcon = team?.img_url;
  const authorName =
    player.current_tid === -2 || player.current_tid === -3
      ? "High School"
      : formatTeamLabel(team);

  const bioStats = stats?.stats ?? {};
  const gp = stats?.gp ?? 0;
  const jerseyNumber = bioStats.jerseyNumber ?? player.jersey_number ?? null;
  const shootingSplits = [
    computeSplit(bioStats.fg, bioStats.fga),
    computeSplit(bioStats.tp, bioStats.tpa),
    computeSplit(bioStats.ft, bioStats.fta),
  ];

  return {
    embeds: [
      {
        author: {
          name: authorName,
          icon_url:
            player.current_tid === -2 || player.current_tid === -3
              ? HIGH_SCHOOL_LOGO
              : authorIcon ?? undefined,
        },
        title: buildPlayerHeader(player, rating),
        thumbnail: isValidEmbedUrl(thumbnailUrl) ? { url: thumbnailUrl } : undefined,
        fields: [
          {
            name: "Bio",
            value: [
              `Jersey: ${jerseyNumber ?? "N/A"}`,
              `Height: ${formatHeight(player.hgt_in)}`,
              `Weight: ${formatWeight(player.weight_lbs)}`,
              `Born: ${player.born_year ?? "Unknown"} (${player.born_loc ?? "Unknown"})`,
              `College: ${player.college ?? "Unknown"}`,
              `HS Grad Year: ${player.class_year ?? "Unknown"}`,
              `Injury: ${formatInjury(player.injury)}`,
            ].join("\n"),
          },
          {
            name: "Current Season (Per Game)",
            value: [
              `${stats?.gp ?? "N/A"} GP | ${stats?.gs ?? "N/A"} GS | ${formatLabeledStat(
                perGame(stats?.min, gp),
                "MPG",
                1
              )}`,
              [
                formatLabeledStat(perGame(stats?.pts, gp), "PPG", 1),
                formatLabeledStat(perGame((stats?.orb ?? 0) + (stats?.drb ?? 0), gp), "RPG", 1),
                formatLabeledStat(perGame(stats?.ast, gp), "APG", 1),
                formatLabeledStat(perGame(stats?.stl, gp), "SPG", 1),
                formatLabeledStat(perGame(stats?.blk, gp), "BPG", 1),
                formatLabeledStat(perGame(stats?.tov, gp), "TOPG", 1),
              ].join(" | "),
              [
                `${shootingSplits[0] ?? "N/A"} FG%`,
                `${shootingSplits[1] ?? "N/A"} 3P%`,
                `${shootingSplits[2] ?? "N/A"} FT%`,
              ].join(" | "),
            ].join("\n"),
          },
          {
            name: "Advanced",
            value: [
              formatLabeledStat(bioStats.per, "PER", 1),
              formatLabeledStat(bioStats.bpm, "BPM", 1),
              formatLabeledStat(bioStats.obpm, "OBPM", 1),
              formatLabeledStat(bioStats.dbpm, "DBPM", 1),
              formatLabeledStat(bioStats.ws, "WS", 1),
              formatLabeledStat(bioStats.ws48, "WS/48", 3),
              formatLabeledStat(bioStats.vorp, "VORP", 1),
              formatLabeledStat(bioStats.ortg, "ORTG", 1),
              formatLabeledStat(bioStats.drtg, "DRTG", 1),
              formatLabeledStat(bioStats.ewa, "EWA", 1),
            ].join(" | "),
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
  const perGameAverages = perGameTotals(totals);

  const seasonLines = seasons
    .slice(0, 10)
    .map((s) => {
      const team = teamMap.get(s.tid);
      const teamLabel = team ? team.abbrev : `T${s.tid}`;
      const classLabel = buildSeasonClassLabel(player, seasonsData.seasons, s.season);
      const gp = s.gp ?? 0;
      const label = classLabel ? `${teamLabel} ${classLabel}` : teamLabel;
      return `${s.season} ${label} — ${s.gp ?? 0} GP | ${s.gs ?? 0} GS | ${formatLabeledStat(
        perGame(s.min, gp),
        "MPG",
        1
      )} ${formatLabeledStat(perGame(s.pts, gp), "PPG", 1)} | ${formatLabeledStat(
        perGame((s.orb ?? 0) + (s.drb ?? 0), gp),
        "RPG",
        1
      )} | ${formatLabeledStat(perGame(s.ast, gp), "APG", 1)} | ${formatLabeledStat(
        perGame(s.stl, gp),
        "SPG",
        1
      )} | ${formatLabeledStat(perGame(s.blk, gp), "BPG", 1)} | ${formatLabeledStat(
        perGame(s.tov, gp),
        "TOPG",
        1
      )}`;
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
              formatLabeledStat(perGameAverages.pts, "PPG", 1),
              formatLabeledStat(perGameAverages.reb, "RPG", 1),
              formatLabeledStat(perGameAverages.ast, "APG", 1),
              formatLabeledStat(perGameAverages.stl, "SPG", 1),
              formatLabeledStat(perGameAverages.blk, "BPG", 1),
            ].join(" | "),
          },
          {
            name: "Career Totals",
            value: [
              `${totals.gp} GP`,
              `${totals.pts} PTS`,
              `${totals.orb + totals.drb} REB`,
              `${totals.ast} AST`,
              `${totals.stl} STL`,
              `${totals.blk} BLK`,
            ].join(" | "),
          },
          {
            name: "Season Stats",
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

function buildRatingsLines(current, previous, keys) {
  return keys
    .map(({ key, label }) => {
      const cur = current?.[key];
      if (typeof cur !== "number") return null;
      const prev = previous?.[key];
      const delta =
        typeof prev === "number" ? `${cur} (${cur - prev >= 0 ? "+" : ""}${cur - prev})` : `${cur}`;
      return `${label}: ${delta}`;
    })
    .filter(Boolean);
}

function buildPlayerEmbedRatings({ playerData, rawData }) {
  const { player, rating } = playerData;
  const ratings = rawData.ratings ?? [];
  const current = ratings[ratings.length - 1]?.ratings ?? ratings[ratings.length - 1];
  const previous = ratings[ratings.length - 2]?.ratings ?? ratings[ratings.length - 2];
  const skills = rating?.skills?.length ? rating.skills.join(", ") : "None";
  const physical = buildRatingsLines(current, previous, [
    { key: "hgt", label: "Height" },
    { key: "stre", label: "Strength" },
    { key: "spd", label: "Speed" },
    { key: "jmp", label: "Jumping" },
    { key: "endu", label: "Endurance" },
  ]);
  const shooting = buildRatingsLines(current, previous, [
    { key: "ins", label: "Inside" },
    { key: "dnk", label: "Dunks/Layups" },
    { key: "ft", label: "Free Throws" },
    { key: "fg", label: "Mid Range" },
    { key: "tp", label: "Three Pointers" },
  ]);
  const skill = buildRatingsLines(current, previous, [
    { key: "oiq", label: "Offensive IQ" },
    { key: "diq", label: "Defensive IQ" },
    { key: "drb", label: "Dribbling" },
    { key: "pss", label: "Passing" },
    { key: "reb", label: "Rebounding" },
  ]);

  return {
    embeds: [
      {
        title: buildPlayerHeader(player, rating),
        fields: [
          { name: "Skills", value: skills },
          {
            name: "Physical (Current vs Last Season)",
            value: physical.length ? physical.join("\n") : "N/A",
            inline: true,
          },
          {
            name: "Shooting (Current vs Last Season)",
            value: shooting.length ? shooting.join("\n") : "N/A",
            inline: true,
          },
          {
            name: "Skill (Current vs Last Season)",
            value: skill.length ? skill.join("\n") : "N/A",
            inline: true,
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

async function buildPlayerMessage(apiBaseUrl, pid, page) {
  const bundle = await loadPlayerBundle(apiBaseUrl, pid);
  const faceAttachment = await renderFacePngAttachment(bundle.playerData.player.face);
  const thumbnailUrl = faceAttachment ? `attachment://${faceAttachment.name}` : null;
  const files = faceAttachment ? [faceAttachment] : [];

  if (page === "career") {
    return {
      ...buildPlayerEmbedCareer(bundle),
      components: [buildPaginationRow(page)],
      files,
    };
  }
  if (page === "ratings") {
    return {
      ...buildPlayerEmbedRatings(bundle),
      components: [buildPaginationRow(page)],
      files,
    };
  }
  return {
    ...buildPlayerEmbedBio({ ...bundle, thumbnailUrl }),
    components: [buildPaginationRow(page)],
    files,
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

const player = {
  data: {
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
  async autocomplete(interaction, { apiBaseUrl }) {
    const query = interaction.options.getString("name") ?? "";
    if (!query.trim()) {
      await interaction.respond([]);
      return;
    }
    try {
      const matches = await apiGet(apiBaseUrl, `/api/players/search?q=${encodeURIComponent(query.trim())}`);
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
  },
  async execute(interaction, { apiBaseUrl }) {
    const nameInput = interaction.options.getString("name", true).trim();
    await interaction.deferReply({ ephemeral: false });

    try {
      if (/^\d+$/.test(nameInput)) {
        try {
          const message = await buildPlayerMessage(apiBaseUrl, Number(nameInput), "bio");
          await interaction.editReply(message);
          return;
        } catch (err) {
          console.error("Direct PID lookup failed:", err);
        }
      }

      const matches = await apiGet(apiBaseUrl, `/api/players/search?q=${encodeURIComponent(nameInput)}`);
      if (!matches.length) {
        await interaction.editReply("No players found.");
        return;
      }

      const teams = await apiGet(apiBaseUrl, "/api/teams?includeSystem=true");
      const teamMap = new Map(teams.map((t) => [t.tid, t]));

      if (matches.length === 1) {
        const message = await buildPlayerMessage(apiBaseUrl, matches[0].pid, "bio");
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
  },
  async handleSelect(interaction, { apiBaseUrl }) {
    const pid = Number(interaction.values[0]);
    if (!Number.isFinite(pid)) return;

    await interaction.deferUpdate();
    try {
      const message = await buildPlayerMessage(apiBaseUrl, pid, "bio");
      await interaction.editReply(message);
    } catch (err) {
      console.error("Player select failed:", err);
      await interaction.editReply({
        content: `❌ Player lookup failed: ${err.message ?? "Unknown error"}`,
        components: [],
      });
    }
  },
  async handleButton(interaction, { apiBaseUrl }) {
    const [prefix, page] = interaction.customId.split(":");
    if (prefix !== "player") return;

    const footer = interaction.message?.embeds?.[0]?.footer?.text;
    const pidValue = footer ? Number(footer.replace("PID ", "")) : NaN;
    if (!Number.isFinite(pidValue)) {
      await interaction.reply({ content: "Unable to determine player.", ephemeral: true });
      return;
    }

    await interaction.deferUpdate();
    try {
      const message = await buildPlayerMessage(apiBaseUrl, pidValue, page);
      await interaction.editReply(message);
    } catch (err) {
      console.error("Player page switch failed:", err);
      await interaction.editReply({
        content: `❌ Player lookup failed: ${err.message ?? "Unknown error"}`,
        components: [],
      });
    }
  },
};

export default player;

function buildSeasonClassLabel(player, seasons, season) {
  if (player.current_tid === -2) return "HS";
  if (player.current_tid === -3) return "GR";
  if (!player.class_year || !Number.isFinite(player.class_year)) return null;

  const entrySeason = player.class_year + 1;
  if (!Number.isFinite(entrySeason)) return null;

  const statsBySeason = new Map(seasons.map((s) => [s.season, s]));
  const entryStats = statsBySeason.get(entrySeason);
  const redshirtUsed = !entryStats || !entryStats.gp;

  const seasonsElapsed = Math.max(0, season - entrySeason);
  const classIndex = seasonsElapsed - (redshirtUsed ? 1 : 0);
  const label = mapClassIndexToLabel(classIndex);
  if (!label) return null;
  return redshirtUsed && season >= entrySeason + 1 ? `RS ${label}` : label;
}

function mapClassIndexToLabel(index) {
  if (index <= 0) return "FR";
  if (index === 1) return "SO";
  if (index === 2) return "JR";
  return "SR";
}
