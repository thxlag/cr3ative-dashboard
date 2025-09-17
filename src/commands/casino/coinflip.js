import { SlashCommandBuilder } from 'discord.js';
import { getUser, incWallet, decWallet } from '../../lib/econ.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { addGamblingProfitToPool } from '../../utils/lottery.js';

export default {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Coinflip vs the house')
    .addIntegerOption(o=> o.setName('bet').setDescription('Bet amount').setRequired(true))
    .addStringOption(o=> o.setName('side').setDescription('heads or tails').addChoices(
      { name: 'heads', value: 'H' }, { name: 'tails', value: 'T' }
    ).setRequired(true)),
  async execute(interaction){
    const userId = interaction.user.id;
    // simple cooldown
    const key = `cf_${userId}`;
    const now = Date.now();
    global.__cf_last = global.__cf_last || new Map();
    const prev = global.__cf_last.get(key) || 0;
    const cdMs = Math.max(1000, Number(process.env.CF_COOLDOWN_MS || 3000));
    if (now - prev < cdMs){
      const s = Math.ceil((cdMs - (now - prev))/1000);
      return interaction.reply({ content: `Please wait **${s}s** before flipping again.`, flags: EPHEMERAL });
    }
    global.__cf_last.set(key, now);
    const bet = Math.floor(interaction.options.getInteger('bet', true));
    const side = interaction.options.getString('side');
    const minBet = Math.max(10, Number(process.env.CF_MIN_BET || 10));
    const maxBet = Math.max(minBet, Number(process.env.CF_MAX_BET || 2000));
    if (bet < minBet) return interaction.reply({ content: `Minimum bet is **${minBet}**.`, flags: EPHEMERAL });
    if (bet > maxBet) return interaction.reply({ content: `Maximum bet is **${maxBet}**.`, flags: EPHEMERAL });
    const u = getUser(userId);
    if (u.wallet < bet) return interaction.reply({ content: 'Not enough in wallet.', flags: EPHEMERAL });
    if (!decWallet(userId, bet, 'coinflip_bet')) return interaction.reply({ content: 'Balance changed; not enough funds.', flags: EPHEMERAL });
    const r = Math.random() < 0.5 ? 'H' : 'T';
    const feePct = Math.max(0, Math.min(0.05, Number(process.env.CF_FEE_PCT || 0.01)));
    if (r === side){
      const win = Math.floor(bet * (1 - feePct) * 2);
      incWallet(userId, win, 'coinflip_win');
      return interaction.reply({ content: `🪙 It was **${r==='H'?'heads':'tails'}** — You win **${win - bet}** (net).` });
    } else {
      try { addGamblingProfitToPool(interaction.guildId, bet); } catch {}
      return interaction.reply({ content: `🪙 It was **${r==='H'?'heads':'tails'}** — You lost **${bet}**.` });
    }
  }
}
