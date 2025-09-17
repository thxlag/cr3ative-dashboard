import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { createRace, getRace, joinRace, startRace, resolveRace, clearRace } from '../../utils/race.js';
import { EPHEMERAL } from '../../utils/flags.js';

export default {
  data: new SlashCommandBuilder()
    .setName('race')
    .setDescription('Create a quick race others can join')
    .addIntegerOption(o=> o.setName('bet').setDescription('Bet per player').setRequired(true))
    .addIntegerOption(o=> o.setName('duration').setDescription('Join window (seconds, default 20)').setRequired(false)),
  async execute(interaction){
    const bet = Math.max(10, Math.floor(interaction.options.getInteger('bet', true)));
    const dur = Math.max(10, Math.min(120, Math.floor(interaction.options.getInteger('duration') || 20)));
    const embed = new EmbedBuilder().setTitle('🏁 Race Lobby').setDescription(`Bet: **${bet}**
Join window: **${dur}s**
Click Join to enter. The host can Start early.`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('race_join').setStyle(ButtonStyle.Primary).setLabel('Join'),
      new ButtonBuilder().setCustomId('race_start').setStyle(ButtonStyle.Success).setLabel('Start')
    );
    await interaction.reply({ embeds: [embed], components: [row] });
    const msg = await interaction.fetchReply();
    createRace({ msgId: msg.id, ownerId: interaction.user.id, bet, durationMs: dur*1000 });
  }
}

