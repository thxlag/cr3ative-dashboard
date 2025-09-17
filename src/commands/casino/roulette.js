import { SlashCommandBuilder } from 'discord.js';
import { getUser, incWallet, decWallet } from '../../lib/econ.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { addGamblingProfitToPool } from '../../utils/lottery.js';

const REDS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function colorOf(n){ if (n === 0) return 'green'; return REDS.has(n) ? 'red' : 'black'; }

export default {
  data: new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('Single-bet roulette spin')
    .addIntegerOption(o=> o.setName('bet').setDescription('Bet amount').setRequired(true))
    .addStringOption(o=> o.setName('type').setDescription('Bet type').setRequired(true).addChoices(
      { name: 'red', value: 'red' },
      { name: 'black', value: 'black' },
      { name: 'odd', value: 'odd' },
      { name: 'even', value: 'even' },
      { name: 'low (1-18)', value: 'low' },
      { name: 'high (19-36)', value: 'high' },
      { name: 'straight (exact number)', value: 'straight' }
    ))
    .addIntegerOption(o=> o.setName('number').setDescription('Number for straight (0-36)').setRequired(false)),
  async execute(interaction){
    const userId = interaction.user.id;
    const bet = Math.floor(interaction.options.getInteger('bet', true));
    const type = interaction.options.getString('type', true);
    const num = interaction.options.getInteger('number');

    const minBet = Math.max(10, Number(process.env.RU_MIN_BET || 10));
    const maxBet = Math.max(minBet, Number(process.env.RU_MAX_BET || 2500));
    if (bet < minBet) return interaction.reply({ content: `Minimum bet is **${minBet}**.`, flags: EPHEMERAL });
    if (bet > maxBet) return interaction.reply({ content: `Maximum bet is **${maxBet}**.`, flags: EPHEMERAL });
    if (type === 'straight'){
      if (num == null || num < 0 || num > 36) return interaction.reply({ content: 'Provide a number between 0 and 36 for straight bets.', flags: EPHEMERAL });
    }

    const econ = getUser(userId);
    if (econ.wallet < bet) return interaction.reply({ content: `You need **${bet}** coins to play.`, flags: EPHEMERAL });
    if (!decWallet(userId, bet, 'roulette_bet')) return interaction.reply({ content: 'Balance changed; not enough funds.', flags: EPHEMERAL });

    // spin
    const spin = Math.floor(Math.random() * 37); // 0..36
    const color = colorOf(spin);
    const feePct = Math.max(0, Math.min(0.05, Number(process.env.RU_FEE_PCT || 0.02)));

    let win = 0; // total returned (including stake)
    if (type === 'straight'){
      if (spin === num) win = Math.floor(bet * (1 - feePct) * 36);
    } else if (type === 'red' || type === 'black'){
      if ((type === 'red' && color === 'red') || (type === 'black' && color === 'black')) win = Math.floor(bet * (1 - feePct) * 2);
    } else if (type === 'odd' || type === 'even'){
      if (spin !== 0 && ((type === 'odd' && spin % 2 === 1) || (type === 'even' && spin % 2 === 0))) win = Math.floor(bet * (1 - feePct) * 2);
    } else if (type === 'low'){
      if (spin >= 1 && spin <= 18) win = Math.floor(bet * (1 - feePct) * 2);
    } else if (type === 'high'){
      if (spin >= 19 && spin <= 36) win = Math.floor(bet * (1 - feePct) * 2);
    }

    if (win > 0){
      incWallet(userId, win, 'roulette_win');
    } else {
      try { addGamblingProfitToPool(interaction.guildId, bet); } catch {}
    }

    const net = win - bet;
    const label = type === 'straight' ? `Straight on **${num}**` : type;
    return interaction.reply({ content: `🎡 Spin: **${spin}** (${color})\nBet: **${bet}** on ${label}\nResult: **${net >= 0 ? `+${net}` : net}**` });
  }
}
