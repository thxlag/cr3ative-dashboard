import { SlashCommandBuilder } from 'discord.js';
export default {
  data: new SlashCommandBuilder().setName('play').setDescription('[coming soon] Play a track'),
  async execute(interaction){ await interaction.reply('Play a track is coming soon.'); }
}
