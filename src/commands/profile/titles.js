import { SlashCommandBuilder } from 'discord.js';
import { listOwned, setTitle } from '../../utils/cosmetics.js';
import { EPHEMERAL } from '../../utils/flags.js';

export default {
  data: new SlashCommandBuilder()
    .setName('titles')
    .setDescription('List and set your title')
    .addSubcommand(s => s.setName('list').setDescription('List your titles'))
    .addSubcommand(s => s.setName('set').setDescription('Set your title').addStringOption(o=> o.setName('key').setDescription('Title key').setRequired(true))),
  async execute(interaction){
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    if (sub === 'list'){
      const rows = listOwned(userId, 'title');
      if (!rows.length) return interaction.reply({ content: 'You do not own any titles yet.', flags: EPHEMERAL });
      const lines = rows.map(r => `• ${r.key}`);
      return interaction.reply({ content: `Your titles:\n${lines.join('\n')}` });
    }
    if (sub === 'set'){
      const key = interaction.options.getString('key', true);
      setTitle(userId, key);
      return interaction.reply({ content: `Title set to **${key}**.` });
    }
  }
}

