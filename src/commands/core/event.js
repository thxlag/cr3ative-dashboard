import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getActiveEvent, getBurstConfig } from '../../utils/events.js';

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
    .setDescription('Show the current event or auto-scheduler info'),
  async execute(interaction){
    const guild = interaction.guild;
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
           `Chooses a random type from:`,
           types.split(',').map(t=>`• ${t}`).join('\n'),
           `Duration is one of: **${minutes}** minutes.`,
           `Cooldown between events: **${cooldown}** minutes.`,
           `Announce channel: ${channel}`
         ].join('\n'));
    return interaction.reply({ embeds: [embed] });
  }
}

