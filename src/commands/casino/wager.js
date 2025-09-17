import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { canAfford, createDuel, getDuel, acceptDuel, resolveDuel, escrowAndPayout, payoutWinner, clearDuel } from '../../utils/duels.js';
import { EPHEMERAL } from '../../utils/flags.js';

export default {
  data: new SlashCommandBuilder()
    .setName('wager')
    .setDescription('Challenge someone to a best-of-3 wager')
    .addUserOption(o=> o.setName('user').setDescription('Opponent').setRequired(true))
    .addIntegerOption(o=> o.setName('bet').setDescription('Bet amount').setRequired(true)),
  async execute(interaction){
    const challenger = interaction.user;
    const target = interaction.options.getUser('user');
    const bet = Math.max(10, Math.floor(interaction.options.getInteger('bet', true)));
    if (!target || target.bot || target.id === challenger.id){
      return interaction.reply({ content: 'Pick a real opponent.', flags: EPHEMERAL });
    }
    if (!canAfford(challenger.id, bet)) return interaction.reply({ content: 'You do not have enough in your wallet.', flags: EPHEMERAL });
    if (!canAfford(target.id, bet)) return interaction.reply({ content: `${target} does not have enough in their wallet.`, flags: EPHEMERAL });

    const embed = new EmbedBuilder().setTitle('🎲 Wager Challenge')
      .setDescription(`${challenger} challenges ${target} for **${bet}** coins.\nBest of 3. Winner takes the pot.`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('duel_accept').setStyle(ButtonStyle.Success).setLabel('Accept'),
      new ButtonBuilder().setCustomId('duel_decline').setStyle(ButtonStyle.Secondary).setLabel('Decline')
    );
    await interaction.reply({ embeds: [embed], components: [row] });
    const msg = await interaction.fetchReply();
    createDuel({ msgId: msg.id, challengerId: challenger.id, targetId: target.id, bet });
  }
}
