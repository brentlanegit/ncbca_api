import loadExport from "./loadExport.js";
import player from "./player.js";

export const commandDefinitions = [loadExport.data, player.data];

const commandMap = new Map([
  [loadExport.data.name, loadExport],
  [player.data.name, player],
]);

export async function handleAutocomplete(interaction, context) {
  if (!interaction.isAutocomplete()) return;
  const handler = commandMap.get(interaction.commandName);
  if (handler?.autocomplete) {
    await handler.autocomplete(interaction, context);
  } else {
    await interaction.respond([]);
  }
}

export async function handleCommand(interaction, context) {
  if (!interaction.isChatInputCommand()) return;
  const handler = commandMap.get(interaction.commandName);
  if (!handler) return;
  await handler.execute(interaction, context);
}

export async function handleComponentInteraction(interaction, context) {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId !== "player:select") return;
    await player.handleSelect(interaction, context);
    return;
  }

  if (interaction.isButton()) {
    const [prefix] = interaction.customId.split(":");
    if (prefix !== "player") return;
    await player.handleButton(interaction, context);
  }
}
