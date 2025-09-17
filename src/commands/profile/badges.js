import { SlashCommandBuilder } from 'discord.js';
import { listOwned, equipBadges } from '../../utils/cosmetics.js';
import { EPHEMERAL } from '../../utils/flags.js';

export default {
  data: new SlashCommandBuilder()
    .setName('badges')
    .setDescription('Manage your badges')
    .addSubcommand(s => s.setName('list').setDescription('List your badges'))
    .addSubcommand(s => s.setName('equip').setDescription('Equip up to 3 badges').addStringOption(o=> o.setName('keys').setDescription('Comma-separated keys').setRequired(true))),
  async execute(interaction){
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    if (sub === 'list'){
      const rows = listOwned(userId, 'badge');
      if (!rows.length) return interaction.reply({ content: 'You do not own any badges yet.', flags: EPHEMERAL });
      const lines = rows.map(r => `• ${r.key}`);
      return interaction.reply({ content: `Your badges:\n${lines.join('\n')}` });
    }
    if (sub === 'equip'){
      const keys = interaction.options.getString('keys', true).split(',').map(s=>s.trim()).filter(Boolean).slice(0,3);
      if (!keys.length) return interaction.reply({ content: 'Provide at least one badge key.', flags: EPHEMERAL });
      equipBadges(userId, keys);
      return interaction.reply({ content: `Equipped: ${keys.join(', ')}` });
    }
  }
}

