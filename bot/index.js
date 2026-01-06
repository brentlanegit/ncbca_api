import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import {
  commandDefinitions,
  handleAutocomplete,
  handleCommand,
  handleComponentInteraction,
} from "./commands/index.js";

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const apiBaseUrl = process.env.API_BASE_URL ?? "http://api:3000";

if (!token || !appId) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_APPLICATION_ID.");
  process.exit(1);
}

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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`Bot logged in as ${client.user?.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) {
    await handleAutocomplete(interaction, { apiBaseUrl });
    return;
  }

  if (interaction.isChatInputCommand()) {
    await handleCommand(interaction, { apiBaseUrl });
    return;
  }

  await handleComponentInteraction(interaction, { apiBaseUrl });
});

await registerCommands();
client.login(token);
