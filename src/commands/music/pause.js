import { SlashCommandBuilder } from 'discord.js';
export default {
  data: new SlashCommandBuilder().setName('pause').setDescription('[coming soon] Pause playback'),
  async execute(interaction){ await interaction.reply('Pause playback is coming soon.'); }
}
