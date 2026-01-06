import { PermissionsBitField, REST, Routes } from "discord.js";

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;

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

registerCommands().catch((err) => {
  console.error("Command registration failed:", err);
  process.exit(1);
});
