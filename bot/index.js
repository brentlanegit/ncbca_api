import fs from "fs/promises";
import path from "path";
import os from "os";
import { Client, GatewayIntentBits, PermissionsBitField, REST, Routes } from "discord.js";
import { importLeagueFromFile } from "../api/import/importLeague.js";

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !appId) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_APPLICATION_ID.");
  process.exit(1);
}

const commandDefinition = {
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
};

const rest = new REST({ version: "10" }).setToken(token);

async function registerCommands() {
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(appId, guildId), {
      body: [commandDefinition],
    });
    console.log(`Registered guild commands for ${guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(appId), { body: [commandDefinition] });
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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`Bot logged in as ${client.user?.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "loadexport") return;

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
});

await registerCommands();
client.login(token);
