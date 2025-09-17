import { log } from '../utils/logger.js';\nimport { recordCommandUsage, recordCommandError } from '../analytics/tracker.js';
import { EPHEMERAL } from '../utils/flags.js';
import { setUserJob, getJob, canApplyToJob, jobChangeRemainingMs, getUserJob, timeUntilWork } from '../utils/jobs.js';
import { claimAll } from '../utils/quests.js';
import { buildQuestsEmbed } from '../utils/quests_ui.js';
import { getRound, reveal as minesReveal, currentPayout, boardButtons, cashRow, cashout as minesCashout, againRow, createRound } from '../utils/mines.js';
import { ROUNDS as BJ_ROUNDS, bjButtons, bjRender, applyAction as bjApply, finalizePayout as bjPayout, bjAgainButtons } from '../utils/blackjack.js';
import { getCrashRound, cashOut as crashCashOut, cashButton as crashCashButton, againButton as crashAgainButton, createCrashRound as crashCreateRound, startCrashTicker as crashStartTicker } from '../utils/crash.js';
import { getUser as getUserEcon, decWallet as decWalletEcon } from '../lib/econ.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { baseEmbed } from '../utils/embeds.js';
import { addGamblingProfitToPool } from '../utils/lottery.js';
import { safeReply } from '../utils/interactions.js';
import aboutbotCommand from '../commands/utilities/aboutbot.js';

const getAboutBotCommand = (client) => client.commands.get('aboutbot') ?? aboutbotCommand;

export async function onInteraction(interaction, db, streamHandler) {
  const report = async (label, err) => {
    try {
      const channelId = process.env.ERRORS_CHANNEL_ID?.trim();
      if (!channelId) return;
      const ch = interaction.client.channels.cache.get(channelId);
      if (!ch?.isTextBased?.()) return;
      const errId = Math.random().toString(36).slice(2, 8);
      const details = (err?.message || String(err || 'error')).slice(0, 500);
      const location = interaction.guild ? `${interaction.guild.name} (${interaction.guildId})` : 'Direct Message';
      await ch.send({ content: `[${label}] ${errId} - <@${interaction.user.id}> - ${location}\n${details}` });
    } catch {}
  };

  try {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      
      if (!command) {
        log.warn(`No command matching ${interaction.commandName} was found.`);
        return;
      }
      
      const startedAt = Date.now();
      try {
        await command.execute(interaction, interaction.client, db, streamHandler);
        recordCommandUsage({
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId ?? null,
          userId: interaction.user?.id ?? 'unknown',
          commandName: interaction.commandName,
          success: true,
          durationMs: Date.now() - startedAt,
          usedAt: startedAt,
        });
      } catch (error) {
        recordCommandError({
          guildId: interaction.guildId ?? null,
          userId: interaction.user?.id ?? 'unknown',
          commandName: interaction.commandName,
          error,
          occurredAt: Date.now(),
        });
        recordCommandUsage({
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId ?? null,
          userId: interaction.user?.id ?? 'unknown',
          commandName: interaction.commandName,
          success: false,
          durationMs: Date.now() - startedAt,
          usedAt: startedAt,
        });
        throw error;
      }
    }
    // Handle button clicks
    else if (interaction.isButton()) {
      // Handle aboutbot buttons
      if (interaction.customId.startsWith('aboutbot_')) {
        const aboutbot = getAboutBotCommand(interaction.client);
        if (aboutbot?.handleInteraction) {
          await aboutbot.handleInteraction(interaction, interaction.client, db);
        }
      }
      // Help navigation buttons
      else if (interaction.customId.startsWith('help_nav:')) {
        const helpCommand = interaction.client.commands.get('help');
        if (helpCommand && helpCommand.handleInteraction) {
          await helpCommand.handleInteraction(interaction);
        }
      }
      else if (interaction.customId.startsWith('help_dm:')) {
        const helpCommand = interaction.client.commands.get('help');
        if (helpCommand && helpCommand.handleInteraction) {
          await helpCommand.handleInteraction(interaction);
        }
      }
    }
    // Handle select menu interactions
    else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'help_category') {
        const helpCommand = interaction.client.commands.get('help');
        if (helpCommand && helpCommand.handleInteraction) {
          await helpCommand.handleInteraction(interaction);
        }
      }
    }
    // Handle modal submissions
    else if (interaction.isModalSubmit()) {
      if (interaction.customId === 'feedback_modal') {
        // This assumes your aboutbot command has a method to handle the modal
        const aboutbot = getAboutBotCommand(interaction.client);
        if (aboutbot?.handleModal) {
          await aboutbot.handleModal(interaction);
        }
      }
    }
    // Handle job apply select menu
    if (interaction.isStringSelectMenu()){
      const id = interaction.customId || '';
    if (id.startsWith('job-apply-select:')){
        const ownerId = id.split(':')[1];
        if (ownerId && ownerId !== interaction.user.id) {
          return interaction.reply({ content: 'This menu is not for you.', flags: EPHEMERAL });
        }
        const select = interaction.values?.[0];
        const jobId = Number(select);
        const job = getJob(jobId);
        if (!job || !job.enabled) return interaction.update({ content: 'That job is no longer available.', components: [] });
        const can = canApplyToJob(interaction.guildId, interaction.user.id, job);
        if (!can.ok){
          const msg = can.code === 'level_req' ? `You need Level ${can.need} for this job.` : 'You do not meet requirements.';
          return interaction.update({ content: msg, components: [] });
        }
        // Check change cooldown
        const current = getUserJob(interaction.user.id);
        const cdSec = Number(process.env.JOB_CHANGE_COOLDOWN_SECONDS || 3600);
        const remaining = current && current.job_id !== job.id ? jobChangeRemainingMs(interaction.user.id, cdSec * 1000) : 0;
        if (remaining > 0) {
          const mins = Math.floor(remaining / 60000), secs = Math.ceil((remaining % 60000)/1000);
          return interaction.update({
            content: `Switching jobs resets your tier and stats. You can switch without confirmation in ${mins}m ${secs}s. Switch to **${job.name}** now?`,
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`job-switch-confirm:${interaction.user.id}:${job.id}`).setStyle(ButtonStyle.Danger).setLabel('Confirm switch'),
                new ButtonBuilder().setCustomId(`job-switch-cancel:${interaction.user.id}`).setStyle(ButtonStyle.Secondary).setLabel('Cancel')
              )
            ]
          });
        }
        setUserJob(interaction.user.id, job.id);
        return interaction.update({ content: `You are now working as a **${job.name}**. Use \`/work\` to start.`, components: [] });
      }
      return; // ignore other component interactions
    }

    // Patch notes button from /aboutbot
    if (interaction.isButton()){
      const id = interaction.customId || '';
      if (id === 'about_patchnotes'){
        const { baseEmbed } = await import('../utils/embeds.js');
        const ver = process.env.BOT_VERSION || 'v5.0.2';
        const lines = [
          '**Economy & Jobs**',
          '• Work: streak bonus, skills (+2%/lvl), gear boosts, specializations.',
          '• Daily contracts: progress + claim, simple buttons.',
          '',
          '**Casino**',
          '• Blackjack live (3:2, provably fair seed); Double supported.',
          '• Roulette live (single-bet: red/black/odd/even/low/high/straight).',
          '• Coinflip live; simple cooldown to prevent spam.',
          '• Slots: all 6 lines active by default, RTP-tuned; Mines polish.',
          '• Slots: increased win rate, boosted payouts for all symbols, and new "Play Again" and "Auto Roll"/"Stop Auto" buttons for fast and automated spins.',
          '• /casinohelp for game rules.',
          '',
          '**Lottery**',
          '• Jackpot pools from ticket spend + dynamic share of house profit.',
          '• Start/End announcements (channel + role ping).',
          '• Paid tickets, auto-end with scheduler, /lottohistory.',
          '',
          '**Crime**',
          '• /crime, /rob, /laylow, /crimeprofile. Heat & cooldowns.',
          '• Insured Wallet item halves losses.',
          '• Crime leaderboard + /mostwanted with role (optional).',
          '',
          '**Social Games**',
          '• /wager: best-of-3 with escrow (replaces /duel).',
          '• /race: join/start lobby, winner takes 90%.',
          '• /heist: co‑op roles (Driver/Hacker/Inside) with shared payout.',
          '',
          '**Crafting & Cosmetics**',
          '• /craft recipes|make — coin sinks route to lottery share.',
          '• /titles and /badges with /profile display.',
          '',
          '**Pets**',
          '• /pet adopt|info|feed|play|train — small Work boost; Pet Food/Toy in shop.',
          '',
          '**Integrations**',
          '• Role-based perks: YouTube Members / Twitch Subs boost Work.',
          '• Foundation for account linking (links store).',
          '',
          '**Admin**',
          '• /ecoadmin gdp — totals + recent flow + current lottery share.',
        ];
        const e = baseEmbed({ title: `Patch Notes — ${ver}`, description: lines.join('\n') });
        return interaction.reply({ embeds: [e], flags: 64 });
      }
    // ---- Duel buttons ----
    if (id === 'duel_accept' || id === 'duel_decline'){
      const msgId = interaction.message?.id;
      const { getDuel, acceptDuel, resolveDuel, escrowAndPayout, payoutWinner, clearDuel } = await import('../utils/duels.js');
      const d = getDuel(msgId);
      if (!d) return interaction.reply({ content: 'This duel expired.', flags: EPHEMERAL });
      if (interaction.user.id !== d.targetId) return interaction.reply({ content: 'Only the challenged user can respond.', flags: EPHEMERAL });
      if (id === 'duel_decline'){
        clearDuel(msgId);
        return interaction.update({ content: 'Wager declined.', components: [] });
      }
      const ok = acceptDuel(msgId);
      if (!ok.ok) return interaction.reply({ content: 'Could not accept.', flags: EPHEMERAL });
      const esc = escrowAndPayout(d);
      if (!esc.ok) { clearDuel(msgId); return interaction.update({ content: 'Wager cancelled (insufficient funds).', components: [] }); }
      const res = resolveDuel(d);
      payoutWinner(res.winner, esc.pot);
      clearDuel(msgId);
      const rounds = res.rounds.join(' • ');
      return interaction.update({ content: `🎲 Wager result: ${rounds}\nWinner: <@${res.winner}> (+${esc.pot})`, components: [] });
    }

    // ---- Race buttons ----
    if (id === 'race_join' || id === 'race_start'){
      const msgId = interaction.message?.id;
      const { getRace, joinRace, startRace, resolveRace, clearRace } = await import('../utils/race.js');
      const race = getRace(msgId);
      if (!race) return interaction.reply({ content: 'This race expired.', flags: EPHEMERAL });
      if (id === 'race_join'){
        const j = joinRace(race, interaction.user.id);
        if (!j.ok){
          const reason = j.code === 'already' ? 'You already joined.' : j.code === 'funds' ? 'Not enough in wallet.' : 'Race already started.';
          return interaction.reply({ content: reason, flags: EPHEMERAL });
        }
        const text = `Players: ${race.players.map(id=>`<@${id}>`).join(', ') || '(none)'}\nBet: **${race.bet}**`;
        return interaction.update({ embeds: [ (await import('../utils/embeds.js')).baseEmbed({ title: '🏁 Race Lobby', description: text, color: 'info' }) ], components: interaction.message.components });
      }
      if (id === 'race_start'){
        if (interaction.user.id !== race.ownerId) return interaction.reply({ content: 'Only the host can start.', flags: EPHEMERAL });
        startRace(race);
        const res = resolveRace(race);
        clearRace(msgId);
        if (!res.ok) return interaction.update({ content: 'Need at least 2 players.', components: [] });
        const places = res.placements.map((u,i)=> `#${i+1} <@${u}>`).join('\n');
        return interaction.update({ content: `🏁 Race results\n${places}\nWinner gets **${Math.floor(res.pool*0.9)}** (10% fee)`, components: [] });
      }
    }

    // ---- Heist buttons ----
    if (id.startsWith('heist_')){
      const msgId = interaction.message?.id;
      const { getHeist, joinHeist, setRole, startHeist, resolveHeist, clearHeist } = await import('../utils/heist.js');
      const heist = getHeist(msgId);
      if (!heist) return interaction.reply({ content: 'This heist expired.', flags: EPHEMERAL });
      if (id === 'heist_join'){
        const j = joinHeist(heist, interaction.user.id);
        if (!j.ok){
          const reason = j.code === 'already' ? 'You already joined.' : j.code === 'funds' ? 'Not enough in wallet.' : 'Heist already started.';
          return interaction.reply({ content: reason, flags: EPHEMERAL });
        }
        const desc = `Members: ${[...heist.members.keys()].map(id=>`<@${id}>`).join(', ') || '(none)'}\nBet: **${heist.bet}**\nPick a role below.`;
        return interaction.update({ embeds: [ (await import('../utils/embeds.js')).baseEmbed({ title: '🎯 Heist Setup', description: desc, color: 'info' }) ], components: interaction.message.components });
      }
      if (id.startsWith('heist_role:')){
        if (!heist.members.has(interaction.user.id)) return interaction.reply({ content: 'Join first.', flags: EPHEMERAL });
        const role = id.split(':')[1];
        setRole(heist, interaction.user.id, role);
        const summary = [...heist.members.entries()].map(([uid, m])=> `<@${uid}> — ${m.role || 'none'}`).join('\n');
        return interaction.update({ embeds: [ (await import('../utils/embeds.js')).baseEmbed({ title: '🎯 Heist Setup', description: summary, color: 'info' }) ] });
      }
      if (id === 'heist_start'){
        if (interaction.user.id !== heist.ownerId) return interaction.reply({ content: 'Only the host can start.', flags: EPHEMERAL });
        startHeist(heist);
        const res = resolveHeist(heist);
        clearHeist(msgId);
        if (res.success){
          const lines = [...res.shares.entries()].map(([uid, amt])=> `• <@${uid}> +${amt}`).join('\n');
          return interaction.update({ content: `✅ Heist success!\n${lines}`, components: [] });
        } else {
          return interaction.update({ content: '💥 Heist failed. Better luck next time.', components: [] });
        }
      }
    }
      // work details button
      if (id.startsWith('work:details:')){
        const token = id.split(':')[2];
        const { getWorkBreakdown } = await import('../utils/work_ui.js');
        const row = getWorkBreakdown(token);
        if (!row || row.userId !== interaction.user.id){
          return interaction.reply({ content: 'Details expired.', flags: EPHEMERAL });
        }
        const b = row.data || {};
        const lines = [];
        lines.push('Breakdown:');
        lines.push(`• Base: ${b.base}`);
        if (b.tMult && b.tMult !== 1) lines.push(`• Tier: ×${b.tMult.toFixed(2)}`);
        if (b.gearMult && b.gearMult !== 1) lines.push(`• Gear: ×${b.gearMult.toFixed(2)}`);
        if (b.event) lines.push(`• Event: ${b.event}${b.eventMult&&b.eventMult!==1?` (×${b.eventMult.toFixed(2)})`:''}${b.flat?` +${b.flat}`:''}`);
        if (b.skillMult && b.skillMult !== 1) lines.push(`• Skill: L${b.skillLevel} ×${b.skillMult.toFixed(2)}`);
        if (b.streakMult && b.streakMult !== 1) lines.push(`• Streak: ${b.streak}d ×${b.streakMult.toFixed(2)}`);
        if (b.serverMult && b.serverMult !== 1) lines.push(`• Server: ×${b.serverMult.toFixed(2)}`);
        if (b.spec) lines.push(`• Spec (${b.spec}): ×${(b.specMult||1).toFixed(2)}`);
        return interaction.reply({ content: lines.join('\n'), flags: EPHEMERAL });
      }
      if (id.startsWith('work:contract:')){
        const ownerId = id.split(':')[2];
        if (ownerId && ownerId !== interaction.user.id) return interaction.reply({ content: 'This button is not for you.', flags: EPHEMERAL });
        const { getOrCreateDailyContract, claimDailyContract } = await import('../utils/work_contracts.js');
        const ct = getOrCreateDailyContract(interaction.user.id);
        const remain = Math.max(0, (ct.required||0) - (ct.progress||0));
        const status = ct.claimed ? 'claimed' : remain === 0 ? 'ready' : `${remain} to go`;
        const comps = [];
        if (!ct.claimed && remain === 0){
          const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`work:contract-claim:${interaction.user.id}`).setStyle(ButtonStyle.Success).setLabel('Claim')
          );
          comps.push(row);
        }
        return interaction.reply({ content: `Daily Contract — progress **${ct.progress}/${ct.required}** • reward **${ct.reward}** • status: **${status}**`, components: comps, flags: EPHEMERAL });
      }
      if (id.startsWith('work:contract-claim:')){
        const ownerId = id.split(':')[2];
        if (ownerId && ownerId !== interaction.user.id) return interaction.reply({ content: 'This button is not for you.', flags: EPHEMERAL });
        const { claimDailyContract } = await import('../utils/work_contracts.js');
        const r = claimDailyContract(interaction.user.id);
        if (!r.ok){
          if (r.code === 'incomplete') return interaction.reply({ content: 'Not ready yet.', flags: EPHEMERAL });
          if (r.code === 'claimed') return interaction.reply({ content: 'Already claimed today.', flags: EPHEMERAL });
          return interaction.reply({ content: 'Cannot claim now.', flags: EPHEMERAL });
        }
        return interaction.reply({ content: `Claimed **+${r.reward}** coins.`, flags: EPHEMERAL });
      }
      if (id.startsWith('quests-')){
        const [, actionWithRest] = id.split('quests-');
        const [action, ownerId, rest] = actionWithRest.split(':');
        if (ownerId && ownerId !== interaction.user.id) {
          return interaction.reply({ content: 'This button is not for you.', flags: EPHEMERAL });
        }
        if (action === 'claim-all'){
          const res = claimAll(interaction.guildId, interaction.user.id);
          const embed = buildQuestsEmbed(interaction.guildId, interaction.user);
          return interaction.update({ content: res.claimed.length ? `Claimed ${res.claimed.length} quest(s).` : 'Nothing to claim.', embeds: [embed] });
        }
        if (action === 'refresh'){
          const embed = buildQuestsEmbed(interaction.guildId, interaction.user);
          return interaction.update({ embeds: [embed] });
        }
      }

      // job-switch confirm/cancel handled below
    }

    // Handle job switch confirm/cancel buttons
    if (interaction.isButton()){
      const id = interaction.customId || '';
      // Blackjack buttons
      if (id.startsWith('bj:')){
        const parts = id.split(':');
        const action = parts[1];
        if (action === 'again'){
          const ownerId = parts[2]; const bet = Math.floor(Number(parts[3]||0));
          if (interaction.user.id !== ownerId) return interaction.reply({ content: 'not your button.', flags: EPHEMERAL });
          return interaction.reply({ content: `Try /blackjack bet:${bet}`, flags: EPHEMERAL });
        }
        const rid = parts[2];
        const round = BJ_ROUNDS.get(rid);
        if (!round) return interaction.reply({ content: 'This round ended.', flags: EPHEMERAL });
        if (round.userId !== interaction.user.id) return interaction.reply({ content: 'This game is not yours.', flags: EPHEMERAL });
        // Handle Double: require extra bet equal to current bet
        if (action === 'dbl'){
          const extra = Math.floor(round.bet || 0);
          const econ = getUserEcon(interaction.user.id);
          if ((econ.wallet||0) < extra){
            return interaction.reply({ content: 'Not enough to double your bet.', flags: EPHEMERAL });
          }
          const ok = decWalletEcon(interaction.user.id, extra, 'bj_double');
          if (!ok){
            return interaction.reply({ content: 'Balance changed; not enough funds to double.', flags: EPHEMERAL });
          }
        }
        const res = bjApply(round, action);
        if (res.ended){
          const net = bjPayout(round);
          const { baseEmbed } = await import('../utils/embeds.js');
          const e = baseEmbed({ title: '🂡 Blackjack', description: bjRender(round, { revealDealer: true })+`\nNet: **${net>=0?`+${net}`:net}**\nSeed: ${round.seed}`, color: net>0?'success':'info' });
          const comps = [bjAgainButtons(interaction.user.id, Math.floor((round.bet || 0)/ (round.double?2:1)))]
          // cleanup
          try { BJ_ROUNDS.delete(round.id); } catch {}
          return interaction.update({ embeds: [e], components: comps });
        } else {
          const { baseEmbed } = await import('../utils/embeds.js');
          const e = baseEmbed({ title: '🂡 Blackjack', description: bjRender(round), color: 'info' });
          return interaction.update({ embeds: [e], components: [bjButtons(round)] });
        }
      }
      // work cooldown checker
      if (id.startsWith('work-check:')){
        const ownerId = id.split(':')[1];
        if (ownerId && ownerId !== interaction.user.id) {
          return interaction.reply({ content: 'This button is not for you.', flags: EPHEMERAL });
        }
        const rem = timeUntilWork(interaction.user.id) || 0;
        const s = Math.ceil(rem/1000);
        return interaction.reply({ content: s ? `You can work again in **${s}s**.` : 'You can work now.', flags: EPHEMERAL });
      }
      if (id.startsWith('job-switch-')){
        const parts = id.split(':');
        const kind = parts[0]; // job-switch-confirm or job-switch-cancel
        const ownerId = parts[1];
        if (ownerId && ownerId !== interaction.user.id) {
          return interaction.reply({ content: 'This button is not for you.', flags: EPHEMERAL });
        }
        if (kind === 'job-switch-cancel') {
          return interaction.update({ content: 'Job change cancelled.', components: [] });
        }
        if (kind === 'job-switch-confirm'){
          const jobId = Number(parts[2]);
          const job = getJob(jobId);
          if (!job || !job.enabled) return interaction.update({ content: 'That job is no longer available.', components: [] });
          const can = canApplyToJob(interaction.guildId, interaction.user.id, job);
          if (!can.ok){
            const msg = can.code === 'level_req' ? `You need Level ${can.need} for this job.` : 'You do not meet requirements.';
            return interaction.update({ content: msg, components: [] });
          }
          setUserJob(interaction.user.id, job.id);
          return interaction.update({ content: `You are now working as a **${job.name}**. Use \`/work\` to start.`, components: [] });
        }
      }
      // do not return; allow other button handlers (e.g., mines) to run
    }

    // Mines: buttons (tile clicks and cashout)
    if (interaction.isButton()){
      const id = interaction.customId || '';
      if (id.startsWith('mines:')){
        const parts = id.split(':');
        // Format variants:
        // - mines:again:<userId>:<bet>:<mines>
        // - mines:<roundId>:btn:<r>,<c>
        // - mines:<roundId>:cash
        if (parts[1] === 'again'){
          const ownerId = parts[2];
          const bet = Math.floor(Number(parts[3]||0));
          const mines = Math.floor(Number(parts[4]||4));
          if (interaction.user.id !== ownerId) return interaction.reply({ content: 'not your board.', flags: EPHEMERAL });
          const econ = getUserEcon(ownerId);
          if ((econ.wallet||0) < bet) return interaction.reply({ content: 'insufficient funds.', flags: EPHEMERAL });
          const ok2 = decWalletEcon(ownerId, bet, 'mines_bet');
          if (!ok2) return interaction.reply({ content: 'balance changed; not enough funds.', flags: EPHEMERAL });
          const fresh = createRound({ userId: ownerId, bet, mines, guildId: interaction.guildId });
          const pay2 = currentPayout(fresh);
          const embed2 = baseEmbed({ title: '💣 Mines', description: [`find gems, avoid bombs — cash out anytime.`, `Mines: **${mines}** • Bet: **${bet}**`, `Potential: **${pay2.win}**`].join('\n'), color: 'info' });
          const rows2 = boardButtons(fresh);
          const comps2 = [cashRow(fresh, pay2.win), ...rows2];
          return interaction.update({ embeds: [embed2], components: comps2 });
        }

        const roundId = parts[1];
        const kind = parts[2];
        const round = getRound(roundId);
        if (!round || round.userId !== interaction.user.id){
          return interaction.reply({ content: 'This game is not yours or has ended.', flags: EPHEMERAL });
        }
        if (kind === 'btn'){
          const rc = parts[3] || '';
          const [r, c] = rc.split(',').map(n=>Number(n));
          const res = minesReveal(round, r, c);
          if (res.ignore){
            return interaction.update({});
          }
          if (res.bomb){
            round.ended = true;
            const embed = baseEmbed({ title: '💣 Mines', description: `boom! you hit a bomb. lost **${round.bet}** 💥`, color: 'error' });
            const rowsAll = boardButtons(round, { revealAll: true });
            const comps = [againRow(interaction.user.id, round.bet, round.mines), ...rowsAll];
            await interaction.update({ embeds: [embed], components: comps });
            try {
              const db = (await import('../lib/db.js')).getDB();
              db.prepare('UPDATE mines_rounds SET ended = 1 WHERE round_id = ?').run(round.id);
            } catch {}
            try { addGamblingProfitToPool(interaction.guildId, round.bet); } catch {}
            return;
          }
          const pay = currentPayout(round);
          const embed = baseEmbed({ title: '💣 Mines', description: `Picks: **${pay.picks}** • Potential: **${pay.win}**`, color: 'info' });
          const rows = boardButtons(round);
          const comps = [cashRow(round, pay.win), ...rows];
          await interaction.update({ embeds: [embed], components: comps });
          return;
        }
        if (kind === 'cash'){
          const res = minesCashout(round);
          const embed = baseEmbed({ title: '💣 Mines', description: `✅ Cashed out: **${res.win}**`, color: 'success' });
          const rows = boardButtons(round, { revealAll: true });
          const comps = [againRow(interaction.user.id, round.bet, round.mines), ...rows];
          try {
            if (res?.ok && res.win > 0) {
              try { incBurstMetric(interaction.guildId, interaction.user.id, 'casino_wins', 1); } catch {}
              try { incBurstMetric(interaction.guildId, interaction.user.id, 'casino_win_amount', res.win); } catch {}
            }
          } catch {}
          // Add net house profit to pool if any
          try { if (res?.ok && round?.bet > res.win) addGamblingProfitToPool(interaction.guildId, round.bet - res.win); } catch {}
          return interaction.update({ embeds: [embed], components: comps });
        }

        if (id.startsWith('crash:')){
          const parts2 = id.split(':');
          const action = parts2[1];
          if (action === 'cash'){
            const rid = parts2[2];
            const round = getCrashRound(rid);
            if (!round) return interaction.reply({ content: 'This round ended.', flags: EPHEMERAL });
            if (round.userId !== interaction.user.id) return interaction.reply({ content: 'This button is not for you.', flags: EPHEMERAL });
            const res = crashCashOut(round);
            try { await interaction.deferUpdate(); } catch {}
            const e = baseEmbed({ title: '🚀 Crash', description: `✅ Cashed out at **${round.multiplier.toFixed(2)}×**\nBet: **${round.bet}**\nWin: **${res.win}**`, color: 'success' });
            const comps = [crashAgainButton(interaction.user.id, round.bet)];
            try { await interaction.message.edit({ embeds: [e], components: comps }); } catch {}
            return;
          }
          if (action === 'again'){
            const ownerId = parts2[2]; const bet = Math.floor(Number(parts2[3]||0));
            if (interaction.user.id !== ownerId) return interaction.reply({ content: 'not your button.', flags: EPHEMERAL });
            // Temporarily disabled
            const disabled = String(process.env.CRASH_DISABLED || 'true').toLowerCase() === 'true';
            if (disabled) return interaction.reply({ content: 'Crash is temporarily disabled.', flags: EPHEMERAL });
            // charge and start a fresh round in-place
            const econ = getUserEcon(ownerId);
            if ((econ.wallet||0) < bet) return interaction.reply({ content: 'insufficient funds.', flags: EPHEMERAL });
            const ok2 = decWalletEcon(ownerId, bet, 'crash_bet');
            if (!ok2) return interaction.reply({ content: 'balance changed; not enough funds.', flags: EPHEMERAL });
            try { await interaction.deferUpdate(); } catch {}
            const round = crashCreateRound({ userId: ownerId, bet, guildId: interaction.guildId });
            const e = baseEmbed({ title: '🚀 Crash', description: `Multiplier: **1.00×**\nBet: **${bet}**\nSpinning…`, color: 'info' });
            try { await interaction.message.edit({ embeds: [e], components: [crashCashButton(round)] }); } catch {}
            round.msgId = interaction.message.id;
            round.channelId = interaction.channelId;
            crashStartTicker(interaction.client, round);
            return;
          }
        }
        if (id.startsWith('slots:prompt:')){
          const parts2 = id.split(':');
          const ownerId = parts2[2]; const bet = Math.floor(Number(parts2[3]||0));
          if (interaction.user.id !== ownerId) return interaction.reply({ content: 'not your button.', flags: EPHEMERAL });
          return interaction.reply({ content: `Try /slots bet:${bet}`, flags: EPHEMERAL });
        }
        if (id.startsWith('bj:prompt:')){
          const parts2 = id.split(':');
          const ownerId = parts2[2]; const bet = Math.floor(Number(parts2[3]||0));
          if (interaction.user.id !== ownerId) return interaction.reply({ content: 'not your button.', flags: EPHEMERAL });
          return interaction.reply({ content: `Try /blackjack bet:${bet}`, flags: EPHEMERAL });
        }
      }
    }

  } catch (e) {
    // catch-all for unexpected component handler errors
    console.error(e);
    await report('interaction handler error', e);
  }
}



