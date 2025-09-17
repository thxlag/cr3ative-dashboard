import { SlashCommandBuilder } from 'discord.js';
import { EPHEMERAL } from '../../utils/flags.js';

export default {
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('Crash is temporarily disabled')
    .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (disabled)').setRequired(false)),
  async execute(interaction){
    return interaction.reply({ content: '🚧 Crash is temporarily disabled while we tune gameplay. Please check back soon.', flags: EPHEMERAL });
  }
}
