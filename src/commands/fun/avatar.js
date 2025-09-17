import { SlashCommandBuilder } from 'discord.js';
export default {
  data: new SlashCommandBuilder().setName('avatar').setDescription('[coming soon] Get your avatar'),
  async execute(interaction){ await interaction.reply('Get your avatar is coming soon.'); }
}
