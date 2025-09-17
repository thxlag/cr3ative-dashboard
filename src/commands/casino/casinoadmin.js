import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';
import { isAdmin } from '../../utils/perm.js';
import { computePoolShare, getLotteryState } from '../../utils/lottery.js';
import { EPHEMERAL } from '../../utils/flags.js';

const DAY = 24 * 60 * 60 * 1000;

function cutoff(period){
  const now = Date.now();
  if (period === '7d') return now - 7 * DAY;
  if (period === '30d') return now - 30 * DAY;
  return null;
}

function fmt(n){ return Number(n||0).toLocaleString(); }

export default {
  data: new SlashCommandBuilder()
    .setName('casinoadmin')
    .setDescription('Admin: casino utilities and stats')
    .addSubcommand(s =>
      s.setName('stats').setDescription('Show casino bets/wins and house profit (global)')
        .addStringOption(o => o.setName('period').setDescription('Time window')
          .addChoices(
            { name: 'last 7 days', value: '7d' },
            { name: 'last 30 days', value: '30d' },
            { name: 'all-time', value: 'all' },
          ))
    ),
  async execute(interaction){
    if (!isAdmin(interaction)){
      return interaction.reply({ content: 'You do not have permission to use this.', flags: EPHEMERAL });
    }
    const sub = interaction.options.getSubcommand();
    if (sub !== 'stats') return interaction.reply({ content: 'Unknown subcommand.', flags: EPHEMERAL });

    const period = interaction.options.getString('period') || '7d';
    const since = cutoff(period);
    const db = getDB();

    const BETS = ['slots_bet','mines_bet','bj_bet','bj_double','coinflip_bet','roulette_bet','crash_bet'];
    const WINS = ['slots_win','mines_cashout','bj_win','coinflip_win','roulette_win','crash_win'];

    function sum(sql, params){ try { return db.prepare(sql).get(...params)?.s || 0; } catch { return 0; } }
    const inClause = (arr)=> '('+arr.map(()=>'?').join(',')+')';

    const bets = since
      ? sum(`SELECT COALESCE(SUM(-amount),0) AS s FROM txns WHERE type='wallet_dec' AND reason IN ${inClause(BETS)} AND created_at >= ?`, [...BETS, since])
      : sum(`SELECT COALESCE(SUM(-amount),0) AS s FROM txns WHERE type='wallet_dec' AND reason IN ${inClause(BETS)}`, BETS);
    const wins = since
      ? sum(`SELECT COALESCE(SUM(amount),0) AS s FROM txns WHERE type='wallet_inc' AND reason IN ${inClause(WINS)} AND created_at >= ?`, [...WINS, since])
      : sum(`SELECT COALESCE(SUM(amount),0) AS s FROM txns WHERE type='wallet_inc' AND reason IN ${inClause(WINS)}`, WINS);

    const profit = bets - wins; // estimated house profit (global)

    // per-game breakdown
    const games = [
      { key: 'slots', bet: ['slots_bet'], win: ['slots_win'] },
      { key: 'mines', bet: ['mines_bet'], win: ['mines_cashout'] },
      { key: 'blackjack', bet: ['bj_bet','bj_double'], win: ['bj_win'] },
      { key: 'coinflip', bet: ['coinflip_bet'], win: ['coinflip_win'] },
      { key: 'roulette', bet: ['roulette_bet'], win: ['roulette_win'] },
      { key: 'crash', bet: ['crash_bet'], win: ['crash_win'] },
    ];

    const lines = games.map(g => {
      const b = since
        ? sum(`SELECT COALESCE(SUM(-amount),0) AS s FROM txns WHERE type='wallet_dec' AND reason IN ${inClause(g.bet)} AND created_at >= ?`, [...g.bet, since])
        : sum(`SELECT COALESCE(SUM(-amount),0) AS s FROM txns WHERE type='wallet_dec' AND reason IN ${inClause(g.bet)}`, g.bet);
      const w = since
        ? sum(`SELECT COALESCE(SUM(amount),0) AS s FROM txns WHERE type='wallet_inc' AND reason IN ${inClause(g.win)} AND created_at >= ?`, [...g.win, since])
        : sum(`SELECT COALESCE(SUM(amount),0) AS s FROM txns WHERE type='wallet_inc' AND reason IN ${inClause(g.win)}`, g.win);
      const p = b - w;
      return `• ${g.key}: bets **${fmt(b)}**, wins **${fmt(w)}**, profit **${fmt(p)}**`;
    });

    let pool = 0; let sharePct = null;
    try { pool = getLotteryState(interaction.guildId)?.pool || 0; } catch {}
    try { sharePct = Math.round(computePoolShare(interaction.guildId) * 100); } catch {}

    const e = new EmbedBuilder()
      .setTitle('🎰 Casino — Admin Stats')
      .setDescription([
        `Period: **${period}**`,
        `Total bets: **${fmt(bets)}**`,
        `Total wins: **${fmt(wins)}**`,
        `House profit (est.): **${fmt(profit)}**`,
        '',
        ...lines,
        '',
        `Lottery (this guild): **${fmt(pool)}**${sharePct!==null?` • Current pool share **${sharePct}%**`:''}`,
      ].join('\n'))
      .setTimestamp(Date.now());

    return interaction.reply({ embeds: [e], flags: EPHEMERAL });
  }
}

