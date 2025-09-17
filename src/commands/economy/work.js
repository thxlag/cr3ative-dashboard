import { SlashCommandBuilder } from 'discord.js';
import { work as doWork, getUserJob } from '../../utils/jobs.js';
import { getUser } from '../../lib/econ.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { safeReply } from '../../utils/interactions.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getUserJobSpec } from '../../utils/jobs.js';
import { putWorkBreakdown } from '../../utils/work_ui.js';
import { incQuest, questMetaByKey } from '../../utils/quests.js';
import { incBurstMetric } from '../../utils/events.js';
import { grantAchievement } from '../../utils/achievements.js';
import { postAchievement } from '../../utils/achievements_feed.js';

export default {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Do your current job to earn coins'),
  async execute(interaction){
    const userId = interaction.user.id;
    const uj = getUserJob(userId);
    if (!uj) {
      return safeReply(interaction, { content: 'You do not have a job yet. Use `/job list` then `/job apply` (or `/job apply id:<id>`).', flags: EPHEMERAL });
    }

    // compute role-based multiplier for supporters (YouTube Members / Twitch Subs)
    let roleMult = 1.0;
    try {
      const ytRole = process.env.YT_MEMBER_ROLE_ID || '';
      const twRole = process.env.TWITCH_SUB_ROLE_ID || '';
      const mem = interaction.member;
      const hasYT = ytRole && mem?.roles?.cache?.has?.(ytRole);
      const hasTW = twRole && mem?.roles?.cache?.has?.(twRole);
      const ytBoost = Number(process.env.YT_WORK_MULT || 1.1);
      const twBoost = Number(process.env.TW_WORK_MULT || 1.1);
      if (hasYT) roleMult *= ytBoost;
      if (hasTW) roleMult *= twBoost;
    } catch {}

    const res = doWork(userId, { roleMult });
    if (!res.ok) {
      if (res.code === 'cooldown') {
        const s = Math.ceil((res.remaining)/1000);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`work-check:${userId}`).setStyle(ButtonStyle.Secondary).setLabel('Check remaining')
        );
        return safeReply(interaction, { content: `You need to rest. Try again in **${s}s**.`, components: [row], flags: EPHEMERAL });
      }
      return safeReply(interaction, { content: 'Could not complete your work. Try again shortly.', flags: EPHEMERAL });
    }
    const extras = [];
    if (res.event?.desc) extras.push(res.event.desc);
    if (res.promoted) extras.push(`Promoted to Tier **${res.newTier}** (+10% pay)!`);
    // Simplified message for users
    const b = res.breakdown || {};
    const lines = [];
    const notes = [];
    if (extras.length) notes.push(...extras);
    lines.push(`You worked as a **${res.job.name}** and earned **${res.amount}** coins.`);
    if (notes.length) lines.push(`Notes: ${notes.join(' • ')}`);
    lines.push(`Next shift in **${Math.ceil(res.next_in/1000)}s**.`);

    // Attach buttons: Details, Contract, Check remaining
    const token = putWorkBreakdown(userId, b);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`work:details:${token}`).setLabel('Details').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`work:contract:${userId}`).setLabel('Contract').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`work-check:${userId}`).setLabel('Check remaining').setStyle(ButtonStyle.Secondary),
    );
    await safeReply(interaction, { content: lines.join('\n'), components: [row] });

    // If spec not set, nudge softly
    try {
      const spec = getUserJobSpec(userId);
      if (!spec) {
        const choose = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`job-spec-choose:${userId}:quality`).setStyle(ButtonStyle.Secondary).setLabel('Quality (+10% pay)'),
          new ButtonBuilder().setCustomId(`job-spec-choose:${userId}:speed`).setStyle(ButtonStyle.Secondary).setLabel('Speed (-10% CD)'),
          new ButtonBuilder().setCustomId(`job-spec-choose:${userId}:vip`).setStyle(ButtonStyle.Secondary).setLabel('VIP (+5% pay)')
        );
        await interaction.followUp({ content: 'Pick a specialization (optional):', components: [choose], flags: EPHEMERAL });
      }
    } catch {}

    // Update quests + achievements
    try {
      const r1 = incQuest(interaction.guildId, userId, 'daily_work', 1);
      const r2 = incQuest(interaction.guildId, userId, 'weekly_work', 1);
      if (r1.completedNow) {
        const meta = questMetaByKey('daily_work');
        try { await interaction.followUp({ content: `Quest ready: **${meta?.name || 'daily_work'}** — use /quests claim.`, flags: EPHEMERAL }); } catch {}
      }
      if (res.promoted) {
        const rP = incQuest(interaction.guildId, userId, 'weekly_promotions', 1);
        if (rP.completedNow) {
          const meta = questMetaByKey('weekly_promotions');
          try { await interaction.followUp({ content: `Quest ready: **${meta?.name || 'weekly_promotions'}** — use /quests claim.`, flags: EPHEMERAL }); } catch {}
        }
      }
      // Grant first_work achievement
      const granted = grantAchievement(interaction.guildId, userId, 'first_work');
      if (granted) await postAchievement(interaction.guild, userId, 'first_work');
      // Check coin total for coin_1000 achievement
      try {
        const econ = getUser(userId);
        if ((econ.wallet + econ.bank) >= 1000) {
          const g2 = grantAchievement(interaction.guildId, userId, 'coin_1000');
          if (g2) await postAchievement(interaction.guild, userId, 'coin_1000');
        }
      } catch {}
      // burst metric
      try { incBurstMetric(interaction.guildId, userId, 'works', 1); } catch {}
    } catch {}
  }
}
