import { SlashCommandBuilder } from 'discord.js';
import { getUser, decWallet } from '../../lib/econ.js';
import { baseEmbed } from '../../utils/embeds.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { createBJRound, bjButtons, bjRender, ROUNDS as BJ_ROUNDS } from '../../utils/blackjack.js';

export default {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Play Blackjack vs Dealer (3:2)')
    .addIntegerOption(o => o.setName('bet').setDescription('Bet amount').setRequired(true)),
  async execute(interaction){
    const userId = interaction.user.id;
    const bet = Math.floor(interaction.options.getInteger('bet', true));
    const minBet = Math.max(10, Number(process.env.BJ_MIN_BET || 10));
    const maxBet = Math.max(minBet, Number(process.env.BJ_MAX_BET || 2000));
    if (bet < minBet) return interaction.reply({ content: `Minimum bet is **${minBet}**.`, flags: EPHEMERAL });
    if (bet > maxBet) return interaction.reply({ content: `Maximum bet is **${maxBet}**.`, flags: EPHEMERAL });
    const econ = getUser(userId);
    if (econ.wallet < bet) return interaction.reply({ content: `You need **${bet}** coins to play.`, flags: EPHEMERAL });
    const ok = decWallet(userId, bet, 'bj_bet');
    if (!ok) return interaction.reply({ content: 'Balance changed; not enough funds.', flags: EPHEMERAL });

    const round = createBJRound({ userId, bet, guildId: interaction.guildId });
    const e = baseEmbed({ title: '🂡 Blackjack', description: bjRender(round), color: 'info' });
    await interaction.reply({ embeds: [e], components: [bjButtons(round)] });
    const msg = await interaction.fetchReply();
    round.msgId = msg.id; BJ_ROUNDS.set(round.id, round);
  }
}
