import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { createHeist, getHeist, joinHeist, setRole, startHeist, resolveHeist, clearHeist } from '../../utils/heist.js';
import { EPHEMERAL } from '../../utils/flags.js';

export default {
  data: new SlashCommandBuilder()
    .setName('heist')
    .setDescription('Start a quick co-op heist')
    .addIntegerOption(o=> o.setName('bet').setDescription('Bet per member').setRequired(true))
    .addIntegerOption(o=> o.setName('duration').setDescription('Join window seconds (default 45)').setRequired(false)),
  async execute(interaction){
    const bet = Math.max(10, Math.floor(interaction.options.getInteger('bet', true)));
    const dur = Math.max(15, Math.min(180, Math.floor(interaction.options.getInteger('duration') || 45)));
    const embed = new EmbedBuilder().setTitle('🎯 Heist Setup').setDescription(`Bet: **${bet}**
Roles needed: Driver, Hacker, Inside
Join window: **${dur}s**
Join then pick a role. The host can Start early.`);
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('heist_join').setStyle(ButtonStyle.Primary).setLabel('Join'),
      new ButtonBuilder().setCustomId('heist_start').setStyle(ButtonStyle.Success).setLabel('Start')
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('heist_role:driver').setStyle(ButtonStyle.Secondary).setLabel('Driver'),
      new ButtonBuilder().setCustomId('heist_role:hacker').setStyle(ButtonStyle.Secondary).setLabel('Hacker'),
      new ButtonBuilder().setCustomId('heist_role:inside').setStyle(ButtonStyle.Secondary).setLabel('Inside')
    );
    await interaction.reply({ embeds: [embed], components: [row1, row2] });
    const msg = await interaction.fetchReply();
    createHeist({ msgId: msg.id, ownerId: interaction.user.id, bet, durationMs: dur*1000 });
  }
}

