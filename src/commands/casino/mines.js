import { SlashCommandBuilder } from 'discord.js';
import { getUser, decWallet } from '../../lib/econ.js';
import { baseEmbed } from '../../utils/embeds.js';
import { createRound, currentPayout, boardButtons, cashRow } from '../../utils/mines.js';

export default {
  data: new SlashCommandBuilder()
    .setName('mines')
    .setDescription('Play Mines (5x5). Avoid bombs and cash out!')
    .addIntegerOption(o => o.setName('bet').setDescription('Bet amount').setRequired(true))
    .addIntegerOption(o => o.setName('mines').setDescription('Number of mines (3–24)').setMinValue(3).setMaxValue(24).setRequired(true)),
  async execute(interaction){
    const userId = interaction.user.id;
    const bet = Math.floor(interaction.options.getInteger('bet', true));
    const mines = Math.floor(interaction.options.getInteger('mines', true));

    const minBet = Math.max(10, Number(process.env.MINES_MIN_BET || 10));
    const maxBet = Math.max(minBet, Number(process.env.MINES_MAX_BET || 2000));
    if (bet < minBet) return interaction.reply({ content: `Minimum bet is **${minBet}**.`, flags: 64 });
    if (bet > maxBet) return interaction.reply({ content: `Maximum bet is **${maxBet}**.`, flags: 64 });

    const econ = getUser(userId);
    if (econ.wallet < bet) return interaction.reply({ content: `You need **${bet}** coins for this round.`, flags: 64 });
    const ok = decWallet(userId, bet, 'mines_bet');
    if (!ok) return interaction.reply({ content: 'Balance changed; not enough funds.', flags: 64 });

    const round = createRound({ userId, bet, mines, guildId: interaction.guildId });
    const pay = currentPayout(round);

    const embed = baseEmbed({
      title: '💣 Mines',
      description: ['find gems, avoid bombs — cash out anytime.', `Mines: **${mines}** • Bet: **${bet}**`, `Potential: **${pay.win}**`].join('\n'),
      color: 'info'
    });

    // Single message layout: [Cash Row] + 4 board rows
    const rows = boardButtons(round);
    const cash = cashRow(round, pay.win);
    const components = [cash, ...rows];
    await interaction.reply({ embeds: [embed], components });
    const msg = await interaction.fetchReply();
    round.msgId = msg.id;
  }
}
