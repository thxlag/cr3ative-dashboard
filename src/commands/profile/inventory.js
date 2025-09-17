import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getInventory } from '../../utils/shop.js';

export default {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your items')
    .addUserOption(o => o.setName('user').setDescription('Another user').setRequired(false)),
  async execute(interaction){
    const user = interaction.options.getUser('user') || interaction.user;
    const inv = getInventory(user.id);
    if (!inv.length) return interaction.reply(`${user.id === interaction.user.id ? 'You have' : `${user.username} has`} no items.`);
    const lines = inv.map(it => `**${it.name}** × ${it.qty}`);
    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s Inventory`)
      .setDescription(lines.join('\n'));
    await interaction.reply({ embeds: [embed] });
  }
}
