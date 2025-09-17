import { SlashCommandBuilder } from 'discord.js';
export default {
  data: new SlashCommandBuilder().setName('meme').setDescription('[coming soon] Fetch a meme'),
  async execute(interaction){ await interaction.reply('Fetch a meme is coming soon.'); }
}
