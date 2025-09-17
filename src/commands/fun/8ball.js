import { SlashCommandBuilder } from 'discord.js';
export default {
  data: new SlashCommandBuilder().setName('8ball').setDescription('[coming soon] Ask the magic 8-ball'),
  async execute(interaction){ await interaction.reply('Ask the magic 8-ball is coming soon.'); }
}
