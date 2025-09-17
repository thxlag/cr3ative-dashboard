// src/commands/events/event.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../../utils/perm.js';
import { getActiveEvent, startEvent, endEvent, startBurstEvent, getBurstConfig } from '../../utils/events.js';
import { getDB } from '../../lib/db.js';
import { EPHEMERAL } from '../../utils/flags.js';

function human(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${ss}s`;
  return `${ss}s`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Admin: run a timed XP boost event with a scoreboard')
    .addSubcommand(s =>
      s.setName('start')
       .setDescription('Start an event')
       .addStringOption(o => o
         .setName('type')
         .setDescription('Event type')
         .setRequired(true)
         .addChoices(
           { name: 'XP Boost', value: 'xp_boost' },
           { name: 'Quest Burst', value: 'quest_burst' },
         ))
       .addIntegerOption(o => o
         .setName('duration')
         .setDescription('Duration minutes (5–180)')
         .setRequired(true))
       .addNumberOption(o => o
         .setName('multiplier')
         .setDescription('XP multiplier (only for XP Boost)')
         .setRequired(false))
       .addStringOption(o => o
         .setName('preset')
         .setDescription('Quest Burst preset')
         .addChoices(
           { name: 'Messages + Work', value: 'msgs_work' },
           { name: 'Messages only', value: 'msgs_only' }
         ))
       .addChannelOption(o => o
         .setName('announce_channel')
         .setDescription('Announce/status channel')
         .setRequired(false))
    )
    .addSubcommand(s =>
      s.setName('end')
       .setDescription('End the current event')
    )
    .addSubcommand(s =>
      s.setName('status')
       .setDescription('Show event status')
    )
    .addSubcommand(s =>
      s.setName('postscore')
       .setDescription('Post the live scoreboard (top 10)')
       .addChannelOption(o => o
         .setName('channel')
         .setDescription('Target channel (default: announce channel)')
         .setRequired(false))
    )
    .addSubcommand(s =>
      s.setName('notype')
       .setDescription('Show current event or auto-scheduler info (no type)')
    ),
  async execute(interaction){
    const guild = interaction.guild;
    const db = getDB();
    const sub = interaction.options.getSubcommand();

    // notype is allowed for everyone
    if (sub !== 'notype' && !isAdmin(interaction)) {
      return interaction.reply({ content: 'You do not have permission to use this.', flags: EPHEMERAL });
    }

    if (sub === 'start') {
      const type = interaction.options.getString('type');
      const duration = Math.max(5, Math.min(interaction.options.getInteger('duration'), 180));
      const ch = interaction.options.getChannel('announce_channel');

      if (getActiveEvent(guild.id)) {
        return interaction.reply({ content: 'An event is already active. Use `/event end` first.', flags: EPHEMERAL });
      }

      if (type === 'quest_burst') {
        const preset = interaction.options.getString('preset') || 'msgs_work';
        let goals = [];
        if (preset === 'msgs_only') goals = [ { metric: 'msgs', target: 50 } ];
        else goals = [ { metric: 'msgs', target: 25 }, { metric: 'works', target: 2 } ];
        const { start_ts, end_ts } = startBurstEvent(guild, {
          durationMin: duration,
          channelId: ch?.id,
          startedBy: interaction.user.id,
          goals,
          winners: 3,
          prizes: { coins: [1000, 600, 400], xp: [0, 0, 0] }
        });
        const target = ch || interaction.channel;
        const embed = new EmbedBuilder()
          .setTitle('🚀 Quest Burst started')
          .setDescription([
            `Goals: ${goals.map(g=> `${g.metric} ≥ ${g.target}`).join(', ')}`,
            `Duration: ${duration} minutes` ,
            `Ends <t:${Math.floor(end_ts/1000)}:R>`,
            `Top 3 win prizes. Good luck!`
          ].join('\n'))
          .setTimestamp(Date.now());
        try { if (target?.isTextBased?.()) await target.send({ embeds: [embed] }); } catch {}
        return interaction.reply({ content: 'Quest Burst started.', flags: EPHEMERAL });
      }

      // default: xp_boost
      const name = interaction.options.getString('name') || 'XP Boost';
      const mult = Math.max(1.1, Math.min(interaction.options.getNumber('multiplier') ?? 1.5, 3.0));
      const { start_ts, end_ts } = startEvent(guild, { name, multiplier: mult, durationMin: duration, channelId: ch?.id, startedBy: interaction.user.id });
      const active = getActiveEvent(guild.id);
      const target = ch || (active?.channel_id ? guild.channels.cache.get(active.channel_id) : interaction.channel);
      const embed = new EmbedBuilder()
        .setTitle(`🏁 ${name} started`)
        .setDescription([
          `XP is boosted by **×${mult.toFixed(2)}** for **${duration} minutes**.`,
          `Ends <t:${Math.floor(end_ts/1000)}:R>.`,
          `Use \`/event postscore\` to post the live scoreboard.`,
        ].join('\n'))
        .setTimestamp(Date.now());
      try { await (target?.isTextBased?.() ? target.send({ embeds: [embed] }) : interaction.channel.send({ embeds: [embed] })); } catch {}
      return interaction.reply({ content: `Started **${name}** (×${mult.toFixed(2)} for ${duration}m).`, flags: EPHEMERAL });
    }

    if (sub === 'end') {
      const active = getActiveEvent(guild.id);
      if (!active) return interaction.reply({ content: 'No active event.', flags: EPHEMERAL });
      endEvent(guild, { announce: true });
      return interaction.reply({ content: `Ended **${active.event_name}**.`, flags: EPHEMERAL });
    }

    if (sub === 'status') {
      const active = getActiveEvent(guild.id);
      if (!active) return interaction.reply({ content: 'No active event.', flags: EPHEMERAL });
      const remaining = active.end_ts - Date.now();
      const embed = new EmbedBuilder()
        .setTitle(`📣 ${active.event_name} — Status`)
        .addFields(
          { name: 'Ends', value: `<t:${Math.floor(active.end_ts/1000)}:R>`, inline: true },
          { name: 'Remaining', value: human(remaining), inline: true },
        )
        .setTimestamp(Date.now());

      // For Quest Burst, include goals and leaders
      const cfg = getBurstConfig(guild.id);
      if (cfg && active.event_name === 'Quest Burst') {
        const goals = Array.isArray(cfg.goals) ? cfg.goals : [];
        if (goals.length) {
          embed.addFields({ name: 'Goals', value: goals.map(g => `• ${g.metric} ≥ ${g.target}`).join('\n') });
        }

        // Leaders (top 5): first completions, else best progress ratios
        const done = db.prepare(`
          SELECT user_id, completed_ts FROM event_progress
          WHERE guild_id = ? AND metric = '__done__' AND completed_ts IS NOT NULL
          ORDER BY completed_ts ASC
          LIMIT 5
        `).all(guild.id);

        let lines = [];
        if (done.length) {
          lines = done.map((r, i) => `**${i+1}.** <@${r.user_id}> — done <t:${Math.floor(r.completed_ts/1000)}:R>`);
        } else {
          const users = db.prepare('SELECT DISTINCT user_id FROM event_progress WHERE guild_id = ? AND metric != "__done__"').all(guild.id);
          const scores = [];
          for (const u of users) {
            let sum = 0;
            for (const g of goals) {
              const v = db.prepare('SELECT value FROM event_progress WHERE guild_id = ? AND user_id = ? AND metric = ?').get(guild.id, u.user_id, g.metric) || { value: 0 };
              sum += Math.min(1, (v.value || 0) / Math.max(1, g.target || 1));
            }
            scores.push({ user_id: u.user_id, score: sum });
          }
          scores.sort((a,b)=> b.score - a.score);
          const top = scores.slice(0, 5);
          lines = top.map((r, i) => `**${i+1}.** <@${r.user_id}> — ${(r.score*100).toFixed(0)}%`);
        }
        if (lines.length) embed.addFields({ name: 'Leaders', value: lines.join('\n') });
      } else {
        // Non-burst XP boost: include multiplier
        embed.addFields({ name: 'Multiplier', value: `×${Number(active.multiplier).toFixed(2)}`, inline: true });
      }

      return interaction.reply({ embeds: [embed], flags: EPHEMERAL });
    }

    if (sub === 'postscore') {
      const active = getActiveEvent(guild.id);
      if (!active) return interaction.reply({ content: 'No active event.', flags: EPHEMERAL });

      const rows = db.prepare(`
        SELECT user_id, SUM(score) AS total
        FROM event_results
        WHERE guild_id = ? AND event_name = ? AND at_ts >= ?
        GROUP BY user_id
        ORDER BY total DESC
        LIMIT 10
      `).all(guild.id, active.event_name, active.start_ts);

      const lines = rows.length
        ? rows.map((r, i) => `**${i+1}.** <@${r.user_id}> — **${r.total}** points`)
        : ['No points yet. Start chatting to earn boosted XP!'];

      const embed = new EmbedBuilder()
        .setTitle(`🏆 ${active.event_name} — Live Scoreboard`)
        .setDescription(lines.join('\n'))
        .setTimestamp(Date.now());

      const target = interaction.options.getChannel('channel') ||
                     (active.channel_id ? guild.channels.cache.get(active.channel_id) : interaction.channel);

      try {
        await (target?.isTextBased?.()
          ? target.send({ embeds: [embed] })
          : interaction.channel.send({ embeds: [embed] }));
        return interaction.reply({ content: 'Posted.', flags: EPHEMERAL });
      } catch (e) {
        return interaction.reply({ content: 'Could not post to that channel.', flags: EPHEMERAL });
      }
    }

    if (sub === 'notype') {
      const active = getActiveEvent(guild.id);
      const embed = new EmbedBuilder().setTimestamp(Date.now());
      if (active) {
        embed.setTitle(`📣 Current Event — ${active.event_name}`)
             .addFields(
               { name: 'Ends', value: `<t:${Math.floor(active.end_ts/1000)}:R>`, inline: true },
               { name: 'Remaining', value: human(active.end_ts - Date.now()), inline: true }
             );
        const cfg = getBurstConfig(guild.id);
        if (cfg && active.event_name === 'Quest Burst') {
          const goals = Array.isArray(cfg.goals) ? cfg.goals : [];
          if (goals.length) embed.addFields({ name: 'Goals', value: goals.map(g => `• ${g.metric} ≥ ${g.target}`).join('\n') });
        } else {
          embed.addFields({ name: 'Multiplier', value: `×${Number(active.multiplier).toFixed(2)}`, inline: true });
        }
        return interaction.reply({ embeds: [embed] });
      }
      // No active event: show scheduler info from env
      const enabled = String(process.env.AUTO_EVENTS_ENABLED || 'false').toLowerCase() === 'true';
      const lookback = Number(process.env.AUTO_EVENTS_LOOKBACK_SEC || 180);
      const minActive = Number(process.env.AUTO_EVENTS_MIN_ACTIVE_USERS || 3);
      const cooldown = Number(process.env.AUTO_EVENTS_COOLDOWN_MIN || 180);
      const types = String(process.env.AUTO_EVENTS_TYPES || 'quest_burst,xp_boost');
      const minutes = String(process.env.AUTO_EVENTS_MINUTES || '15,30');
      const channel = process.env.EVENTS_ANNOUNCE_CHANNEL_ID ? `<#${process.env.EVENTS_ANNOUNCE_CHANNEL_ID}>` : '(not set)';
      embed.setTitle('ℹ️ Event Auto‑Scheduler')
           .setDescription([
             enabled ? 'Auto events are ENABLED.' : 'Auto events are DISABLED.',
             `Starts when ≥ **${minActive}** users chat within **${lookback}s**.`,
             `Chooses a random type from: 
${types.split(',').map(t=>`• ${t}`).join('\n')}`,
             `Duration is one of: **${minutes}** minutes.`,
             `Cooldown between events: **${cooldown}** minutes.`,
             `Announce channel: ${channel}`
           ].join('\n'));
      return interaction.reply({ embeds: [embed] });
    }
  }
}
