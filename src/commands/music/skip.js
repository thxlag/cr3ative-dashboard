import { SlashCommandBuilder } from 'discord.js';
export default {
  data: new SlashCommandBuilder().setName('skip').setDescription('[coming soon] Skip current track'),
  async execute(interaction){ await interaction.reply('Skip current track is coming soon.'); }
}
