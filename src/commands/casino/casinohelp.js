import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed } from '../../utils/embeds.js';
import { safeReply } from '../../utils/interactions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('casinohelp')
    .setDescription('Show rules for a casino game')
    .addStringOption(o =>
      o.setName('type')
       .setDescription('Which game')
       .setRequired(true)
       .addChoices(
         { name: 'Slots', value: 'slots' },
         { name: 'Mines', value: 'mines' },
         { name: 'Crash', value: 'crash' },
       )
    ),
  async execute(interaction){
    const type = interaction.options.getString('type', true);

    if (type === 'slots'){
      const embed = baseEmbed({ title: 'Casino Help — Slots', color: 'info' });
      const lines = [
        'How to win:',
        '• Match 3 identical symbols on any horizontal line (top, middle, bottom).',
        '• Order does not matter; all three must be the same.',
        '• No diagonals or verticals.',
        '',
        'Lines & bets:',
        '• All 3 lines are always active. Your bet covers all lines.',
        '• Each winning line pays its multiplier; multiple wins add together.',
        '',
        'Payouts (per winning line):',
        '• 🍒 ×2   • 🍋 ×3   • 🍇 ×5',
        '• 🔔 ×10  • ⭐ ×25  • 💎 ×50',
        '',
        'Notes:',
        '• Symbols are weighted: rare symbols pay higher but appear less often.',
        '• Wins are slightly scaled by RTP (default ~0.94).',
        '• Net = Win − Bet (bet covers 3 lines).',
        '',
        'Example:',
        '• Bet 150 (covers all 3 lines). If the top row shows 🔔🔔🔔, you win ≈ (150/3) × 10 (× RTP) and your total bet is 150.',
      ];
      embed.setDescription(lines.join('\n'));
      return safeReply(interaction, { embeds: [embed] });
    }

    if (type === 'mines'){
      const embed = baseEmbed({ title: 'Casino Help — Mines', color: 'info' });
      const lines = [
        'How to play:',
        '• Pick the number of mines (3–24), then start the round.',
        '• Click tiles to reveal gems. Each safe pick increases your potential payout.',
        '• Hit a bomb and you lose the bet. Cash out anytime to bank your current winnings.',
        '',
        'Payouts:',
        '• Your potential win grows with each safe pick (progressive payout).',
        '• More mines = higher risk, higher potential payout per pick.',
        '• The Cash Out button shows the current payout; it’s disabled until you’ve made at least 1 safe pick.',
        '',
        'Tips:',
        '• Start with fewer mines to learn the feel; add mines for bigger risk/reward.',
        '• Cashing out early locks your gains; pushing your luck might hit a bomb.',
      ];
      embed.setDescription(lines.join('\n'));
      return safeReply(interaction, { embeds: [embed] });
    }

    if (type === 'crash'){
      const embed = baseEmbed({ title: 'Casino Help — Crash', color: 'info' });
      const lines = [
        'Goal:',
        '• Ride the multiplier up and press Cash Out before it busts.',
        '',
        'Round flow:',
        '• Place your bet and the multiplier starts at 1.00× and rises.',
        '• A random bust point ends the round instantly — if you didn’t cash out, you lose the bet.',
        '• If you cash out in time, you win based on your current multiplier.',
        '',
        'Payout:',
        '• Win = bet × current multiplier × RTP (default ~0.95).',
        '• Higher multipliers mean bigger wins but bigger bust risk.',
        '',
        'Tips:',
        '• Set a target (e.g., 1.50×–2.00×) and stick to it.',
        '• The longer you wait, the faster risk ramps up.',
      ];
      embed.setDescription(lines.join('\n'));
      return safeReply(interaction, { embeds: [embed] });
    }

    // fallback (should not happen with choices)
    return safeReply(interaction, { content: 'Help for that game is not available yet.' });
  }
}
