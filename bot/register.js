import { REST, Routes } from "discord.js";
import { commandDefinitions } from "./commands/index.js";

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;

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

registerCommands().catch((err) => {
  console.error("Command registration failed:", err);
  process.exit(1);
});
