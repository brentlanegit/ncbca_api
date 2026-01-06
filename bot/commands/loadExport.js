import fs from "fs/promises";
import path from "path";
import os from "os";
import { PermissionsBitField } from "discord.js";
import { importLeagueFromFile } from "../../api/import/importLeague.js";

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

const loadExport = {
  data: {
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
  async execute(interaction) {
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
  },
};

export default loadExport;
