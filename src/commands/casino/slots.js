import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getUser, incWallet, decWallet } from '../../lib/econ.js';
import { baseEmbed } from '../../utils/embeds.js';
import { incBurstMetric } from '../../utils/events.js';
import { addGamblingProfitToPool } from '../../utils/lottery.js';

// 3x3 slots. All 3 horizontal + 3 vertical lines are active; bet covers all lines.
const SYMBOLS = [
  { e: '🍒', w: 60, p: 4 },   // increased payout
  { e: '🍋', w: 50, p: 6 },   // increased payout
  { e: '🍇', w: 30, p: 12 },  // increased payout
  { e: '🔔', w: 15, p: 24 },  // increased payout
  { e: '⭐', w: 6,  p: 60 },  // increased payout
  { e: '💎', w: 3,  p: 120 }, // increased payout
];

const COOLDOWN_MS = 3000;
const lastSpin = new Map(); // userId -> ts

function pickWeighted(){
  const total = SYMBOLS.reduce((a,s)=>a+s.w,0);
  const r = Math.random()*total;
  let acc = 0;
  for (const s of SYMBOLS){ acc += s.w; if (r <= acc) return s; }
  return SYMBOLS[0];
}
function spinGrid(){
  const grid = [];
  for (let r=0;r<3;r++){
    const row = [];
    for (let c=0;c<3;c++) row.push(pickWeighted().e);
    grid.push(row);
  }
  return grid;
}
function payoutForLine(row){
  if (row[0] === row[1] && row[1] === row[2]){
    const sym = SYMBOLS.find(s=>s.e===row[0]);
    return sym ? sym.p : 0;
  }
  return 0;
}
function renderGrid(grid){ return grid.map(r=>r.join(' ')).join('\n'); }

// Helper to build action row with play/auto/stop buttons
function getButtons({ auto = false, disabled = false } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('slots_play_again')
      .setLabel('Play Again')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    !auto
      ? new ButtonBuilder()
          .setCustomId('slots_auto')
          .setLabel('Auto Roll')
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled)
      : new ButtonBuilder()
          .setCustomId('slots_stop_auto')
          .setLabel('Stop Auto')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled)
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Spin 3x3 slots — bet covers all 6 lines')
    .addIntegerOption(o=>o.setName('bet').setDescription('Total bet (covers all 3 lines)').setRequired(true)),
  async execute(interaction){
    const userId = interaction.user.id;

    // cooldown
    const now = Date.now();
    const prev = lastSpin.get(userId) || 0;
    if (now - prev < COOLDOWN_MS){
      const wait = Math.ceil((COOLDOWN_MS - (now - prev))/1000);
      interaction.reply({ content: `Please wait ${wait}s before spinning again.`, flags: 64 });
      return;
    }
    lastSpin.set(userId, now);

    const minBet = Math.max(10, Number(process.env.SLOTS_MIN_BET || 10));
    const maxBet = Math.max(minBet, Number(process.env.SLOTS_MAX_BET || 1000));
    const bet = Math.floor(interaction.options.getInteger('bet', true));
    if (bet < minBet) { interaction.reply({ content: `Minimum bet is **${minBet}**.`, flags: 64 }); return; }
    if (bet > maxBet) { interaction.reply({ content: `Maximum bet is **${maxBet}**.`, flags: 64 }); return; }

    const totalBet = bet; // bet covers all 3 lines
    const econ = getUser(userId);
    if (econ.wallet < totalBet){ interaction.reply({ content: `You need **${totalBet}** coins for this spin.`, flags: 64 }); return; }
    const ok = decWallet(userId, totalBet, 'slots_bet');
    if (!ok) { interaction.reply({ content: 'Balance changed; not enough funds.', flags: 64 }); return; }

    // Extracted spin logic for reuse
    async function doSpin(inter, bet, opts = {}) {
      const grid = spinGrid();
      // Build 6 lines: 3 rows + 3 columns
      const lines = [];
      for (let r=0;r<3;r++) lines.push({ kind: 'row', index: r, cells: grid[r] });
      for (let c=0;c<3;c++) lines.push({ kind: 'col', index: c, cells: [grid[0][c], grid[1][c], grid[2][c]] });
      let payoutMult = 0;
      const results = [];
      for (const line of lines){
        const mult = payoutForLine(line.cells);
        payoutMult += mult;
        if (mult>0) results.push(`${line.kind === 'row' ? 'Row' : 'Col'} ${line.index+1}: ×${mult}`);
      }

  // More generous default RTP and multiplier boost
  const rtp = Math.min(0.999, Math.max(0.80, Number(process.env.SLOTS_RTP || 0.995))); // higher RTP
  const rtpAdj = rtp / 0.95;
  const multBoost = Math.max(1.2, Number(process.env.SLOTS_MULT_BOOST || 1.4)); // higher global boost
      let win = Math.floor((bet / lines.length) * payoutMult * multBoost * rtpAdj);
      win = Math.min(win, bet * 200);

      if (win > 0){
        incWallet(userId, win, 'slots_win');
        try { incBurstMetric(inter.guildId, userId, 'casino_wins', 1); } catch {}
        try { incBurstMetric(inter.guildId, userId, 'casino_win_amount', win); } catch {}
      }
      const net = win - totalBet;

      // animate without await
      const render = (g)=>{
        const code = ['```', renderGrid(g), '```'].join('\n');
        return baseEmbed({ title: `${inter.user.username} • Slots`, description: code + '\nSpinning...', color: 'info' });
      };
      const spinnerRow = ()=> ['▒','▒','▒'];
      const frameGrid = (revealRows)=>{
        const out = [];
        for (let r=0;r<3;r++) out.push(r<revealRows? grid[r] : spinnerRow());
        return out;
      };
      const delay = Math.max(200, Math.min(1500, Number(process.env.SLOTS_ANIM_DELAY_MS || 500)));
      if (!opts.edit) await inter.reply({ embeds: [render(frameGrid(0))], components: opts.components || [] });
      else await inter.editReply({ embeds: [render(frameGrid(0))], components: opts.components || [] });
      setTimeout(()=>{ try { inter.editReply({ embeds: [render(frameGrid(1))], components: opts.components || [] }); } catch {} }, delay);
      setTimeout(()=>{ try { inter.editReply({ embeds: [render(frameGrid(2))], components: opts.components || [] }); } catch {} }, delay*2);

      return new Promise(resolve => {
        setTimeout(()=>{
          const parts = [
            '```', renderGrid(grid), '```',
            (results.length ? results.join(' • ') : 'No winning lines'),
            `Bet: **${bet}** (covers all 6 lines)`,
            `Win: **${win}** • Net: **${net >= 0 ? '+'+net : net}**`
          ];
          const color = win > 0 ? 'success' : 'info';
          const finalEmbed = baseEmbed({ title: `${inter.user.username} • Slots`, description: parts.join('\n'), color });
          try { inter.editReply({ embeds: [finalEmbed], components: opts.components || [] }); } catch {}
          try { if (net < 0) addGamblingProfitToPool(inter.guildId, -net); } catch {}
          resolve({ win, net, finalEmbed });
        }, delay*3);
      });
    }

    // Initial spin
    let autoRolling = false;
    let stopAuto = false;
    let lastBet = bet;
    let lastInteraction = interaction;

    async function startSpin(inter, bet, opts = {}) {
      // Check balance before each spin
      const econ = getUser(inter.user.id);
      if (econ.wallet < bet) {
        await inter.editReply?.({ content: `You need **${bet}** coins for this spin.`, embeds: [], components: [] }).catch(()=>{});
        return null;
      }
      const ok = decWallet(inter.user.id, bet, 'slots_bet');
      if (!ok) {
        await inter.editReply?.({ content: 'Balance changed; not enough funds.', embeds: [], components: [] }).catch(()=>{});
        return null;
      }
      return await doSpin(inter, bet, opts);
    }

    // First spin with buttons
    await doSpin(interaction, bet, { components: [getButtons()] });

    // Button collector
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 5*60*1000 }); // 5 min

    collector.on('collect', async btnInt => {
      if (btnInt.user.id !== interaction.user.id) {
        await btnInt.reply({ content: 'Only you can use these buttons.', ephemeral: true });
        return;
      }
      if (btnInt.customId === 'slots_play_again') {
        lastBet = bet;
        await btnInt.deferUpdate();
        await startSpin(btnInt, lastBet, { edit: true, components: [getButtons()] });
      }
      if (btnInt.customId === 'slots_auto') {
        autoRolling = true;
        stopAuto = false;
        await btnInt.deferUpdate();
        await btnInt.editReply({ components: [getButtons({ auto: true })] });
        // Start auto rolling
        while (autoRolling && !stopAuto) {
          const res = await startSpin(btnInt, lastBet, { edit: true, components: [getButtons({ auto: true })] });
          if (!res) break;
          await new Promise(r=>setTimeout(r, 1200)); // delay between auto spins
        }
        autoRolling = false;
        await btnInt.editReply({ components: [getButtons({ auto: false })] });
      }
      if (btnInt.customId === 'slots_stop_auto') {
        stopAuto = true;
        autoRolling = false;
        await btnInt.deferUpdate();
        await btnInt.editReply({ components: [getButtons({ auto: false })] });
      }
    });

    collector.on('end', async () => {
      try { await interaction.editReply({ components: [getButtons({ disabled: true })] }); } catch {}
    });
  }
}
