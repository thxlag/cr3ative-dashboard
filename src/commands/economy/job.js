import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { listJobs, getJob, getUserJob, setUserJob, canApplyToJob, userLevelInGuild, jobChangeRemainingMs } from '../../utils/jobs.js';
import { getDB } from '../../lib/db.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { safeReply } from '../../utils/interactions.js';

function human(ms){
  const s = Math.ceil(ms/1000);
  const m = Math.floor(s/60), r = s%60;
  if (m) return `${m}m ${r}s`;
  return `${r}s`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('job')
    .setDescription('Browse and manage your job')
    .addSubcommand(s =>
      s.setName('list').setDescription('List available jobs')
    )
    .addSubcommand(s =>
      s.setName('info').setDescription('Show job details')
        .addIntegerOption(o => o.setName('id').setDescription('Job ID (omit for your current job)').setRequired(false))
    )
    .addSubcommand(s =>
      s.setName('apply').setDescription('Apply for a job (omit id to auto-pick)')
        .addIntegerOption(o => o.setName('id').setDescription('Job ID').setRequired(false))
    )
    .addSubcommand(s =>
      s.setName('stats').setDescription('Show your current job and stats')
    )
    .addSubcommand(s =>
      s.setName('contract').setDescription('Daily job contract: progress and claim')
        .addStringOption(o=> o.setName('action').setDescription('view or claim').setRequired(true).addChoices(
          { name: 'view', value: 'view' },
          { name: 'claim', value: 'claim' },
        ))
    )
    .addSubcommand(s =>
      s.setName('spec').setDescription('View or set your job specialization')
        .addStringOption(o=> o.setName('action').setDescription('view or set').setRequired(true).addChoices(
          { name: 'view', value: 'view' },
          { name: 'set', value: 'set' },
        ))
        .addStringOption(o=> o.setName('type').setDescription('specialization type').setRequired(false).addChoices(
          { name: 'quality (+10% pay)', value: 'quality' },
          { name: 'speed (-10% cooldown)', value: 'speed' },
          { name: 'vip (+5% pay)', value: 'vip' },
        ))
    ),
  async execute(interaction){
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (sub === 'list'){
      const rows = listJobs();
      if (!rows.length) return safeReply(interaction, 'No jobs available yet.');
      const lines = rows.map(j => `**#${j.id}** — ${j.name} • pays **${j.min_pay}–${j.max_pay}** • cooldown **${j.cooldown_sec}s** • requires level **${j.level_req}**`);
      const embed = new EmbedBuilder().setTitle('Jobs').setDescription(lines.join('\n'));
      return safeReply(interaction, { embeds: [embed] });
    }

    if (sub === 'info'){
      const id = interaction.options.getInteger('id');
      let job;
      if (id){
        job = getJob(id);
      } else {
        const uj = getUserJob(userId);
        if (!uj) return interaction.reply({ content: 'You do not have a job. Use `/job list` then `/job apply` (or `/job apply id:<id>`).', flags: EPHEMERAL });
        job = uj;
      }
      if (!job) return interaction.reply({ content: 'Job not found.', flags: EPHEMERAL });
      const embed = new EmbedBuilder()
        .setTitle(`Job #${job.id} — ${job.name}`)
        .setDescription(job.description || 'No description')
        .addFields(
          { name: 'Pay', value: `${job.min_pay}–${job.max_pay}`, inline: true },
          { name: 'Cooldown', value: `${job.cooldown_sec}s`, inline: true },
          { name: 'Level Required', value: `${job.level_req}`, inline: true },
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'apply'){
      const providedId = interaction.options.getInteger('id');
      let job = providedId ? getJob(providedId) : null;

      if (!job) {
        // Auto-pick best job based on level (highest level_req <= user level). Fallback to lowest requirement.
        const db = getDB();
        const lvl = userLevelInGuild(db, guildId, userId);
        const jobs = listJobs();
        const eligible = jobs.filter(j => (j.enabled) && (lvl >= (j.level_req || 0)));
        if (eligible.length > 1) {
          const options = eligible.slice(0, 25).map(j => ({
            label: j.name,
            description: `Pay ${j.min_pay}-${j.max_pay} • CD ${j.cooldown_sec}s • Lv ${j.level_req}`.slice(0, 100),
            value: String(j.id)
          }));
          const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`job-apply-select:${userId}`)
              .setPlaceholder('Choose your job')
              .addOptions(options)
          );
          return safeReply(interaction, { content: 'Select a job you qualify for:', components: [row] });
        } else if (eligible.length === 1) {
          job = eligible[0];
        } else if (jobs.length) {
          job = jobs.sort((a,b)=> (a.level_req - b.level_req) || (a.min_pay - b.min_pay))[0];
        }
      }

      if (!job || !job.enabled) return safeReply(interaction, { content: 'That job is not available.', flags: EPHEMERAL });
      const can = canApplyToJob(guildId, userId, job);
      if (!can.ok) {
        if (can.code === 'level_req') return safeReply(interaction, { content: `You need to be at least **Level ${can.need}** to apply.`, flags: EPHEMERAL });
        return safeReply(interaction, { content: 'You do not meet the requirements for this job.', flags: EPHEMERAL });
      }

      // Check for change cooldown if switching to a different job
      const current = getUserJob(userId);
      const cdSec = Number(process.env.JOB_CHANGE_COOLDOWN_SECONDS || 3600);
      const remaining = current && current.job_id !== job.id ? jobChangeRemainingMs(userId, cdSec * 1000) : 0;
      if (remaining > 0) {
        const mins = Math.floor(remaining / 60000), secs = Math.ceil((remaining % 60000)/1000);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`job-switch-confirm:${userId}:${job.id}`).setStyle(ButtonStyle.Danger).setLabel('Confirm switch'),
          new ButtonBuilder().setCustomId(`job-switch-cancel:${userId}`).setStyle(ButtonStyle.Secondary).setLabel('Cancel')
        );
        return safeReply(interaction, { content: `Switching jobs resets your tier and stats. You can switch without confirmation in ${mins}m ${secs}s. Switch to **${job.name}** now?`, components: [row] });
      }

      setUserJob(userId, job.id);
      const suffix = providedId ? '' : ' (auto-selected based on your level)';
      return safeReply(interaction, { content: `You are now working as a **${job.name}**${suffix}. Use \`/work\` to start.` });
    }

    if (sub === 'stats'){
      const uj = getUserJob(userId);
      if (!uj) return safeReply(interaction, { content: 'You do not have a job. Use `/job list` then `/job apply` (or `/job apply id:<id>`).', flags: EPHEMERAL });
      const nextIn = Math.max(0, (uj.last_work_at + uj.cooldown_sec * 1000) - Date.now());
      // streak + skills
      const db = getDB();
      let streak = 0;
      try { const r = db.prepare('SELECT work_streak FROM users WHERE user_id = ?').get(userId); streak = r?.work_streak || 0; } catch {}
      let skill = { level: 1, xp: 0 };
      try { const r = db.prepare('SELECT level, xp FROM user_job_skills WHERE user_id = ? AND job_id = ?').get(userId, uj.job_id); if (r) skill = r; } catch {}
      const embed = new EmbedBuilder()
        .setTitle(`${interaction.user.username} • ${uj.name}`)
        .setDescription(uj.description || 'No description')
        .addFields(
          { name: 'Pay', value: `${uj.min_pay}–${uj.max_pay}`, inline: true },
          { name: 'Cooldown', value: `${uj.cooldown_sec}s`, inline: true },
          { name: 'Tier', value: `${uj.tier || 1}`, inline: true },
          { name: 'Works Completed', value: `${uj.works_completed}`, inline: true },
          { name: 'Total Earned', value: `${uj.total_earned}`, inline: true },
          { name: 'Next Work', value: nextIn ? `in ${human(nextIn)}` : 'now', inline: true },
          { name: 'Work Streak', value: `${streak} day(s)`, inline: true },
          { name: 'Skill Level', value: `L${skill.level} (${skill.xp} xp)`, inline: true },
        );
      // Show progress to next promotion if not maxed
      const tier = uj.tier || 1;
      const thresholds = [10, 30, 60, 100, 150];
      if (tier < thresholds.length + 1) {
        const need = thresholds[tier - 1];
        embed.setFooter({ text: `Promotion progress: ${Math.min(uj.works_completed, need)}/${need} works` });
      } else {
        embed.setFooter({ text: 'Max tier reached' });
      }
      return safeReply(interaction, { embeds: [embed] });
    }

    if (sub === 'contract'){
      const action = interaction.options.getString('action');
      const { getOrCreateDailyContract, claimDailyContract } = await import('../../utils/work_contracts.js');
      if (action === 'view'){
        const ct = getOrCreateDailyContract(userId);
        const remain = Math.max(0, (ct.required||0) - (ct.progress||0));
        const status = ct.claimed ? 'claimed' : remain === 0 ? 'ready' : `${remain} to go`;
        return safeReply(interaction, { content: `Daily Contract — progress **${ct.progress}/${ct.required}** • reward **${ct.reward}** • status: **${status}**` });
      }
      if (action === 'claim'){
        const r = claimDailyContract(userId);
        if (!r.ok){
          if (r.code === 'incomplete') return safeReply(interaction, { content: `Not ready. Progress **${r.have}/${r.need}**.`, flags: EPHEMERAL });
          if (r.code === 'claimed') return safeReply(interaction, { content: 'You already claimed today.', flags: EPHEMERAL });
          return safeReply(interaction, { content: 'Cannot claim now.', flags: EPHEMERAL });
        }
        return safeReply(interaction, { content: `Claimed your daily contract: **+${r.reward}** coins.` });
      }
    }

    if (sub === 'spec'){
      const action = interaction.options.getString('action');
      const { setUserJobSpec, getUserJobSpec } = await import('../../utils/jobs.js');
      if (action === 'view'){
        const spec = getUserJobSpec(userId) || 'none';
        return safeReply(interaction, { content: `Your specialization: **${spec}**` });
      }
      if (action === 'set'){
        const type = interaction.options.getString('type');
        if (!type) return safeReply(interaction, { content: 'Choose a specialization type.', flags: EPHEMERAL });
        setUserJobSpec(userId, type);
        const desc = type === 'quality' ? '+10% pay' : type === 'speed' ? '-10% cooldown' : '+5% pay';
        return safeReply(interaction, { content: `Specialization set to **${type}** (${desc}).` });
      }
    }
  }
}
