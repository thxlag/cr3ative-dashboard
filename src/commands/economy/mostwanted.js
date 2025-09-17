import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';
import { getCrimeProfile } from '../../utils/crime.js';

const DAY = 24 * 60 * 60 * 1000;

function cutoffFromPeriod(period){
  const now = Date.now();
  if (period === '7d') return now - 7 * DAY;
  if (period === '30d') return now - 30 * DAY;
  return null;
}

async function applyMostWantedRole(guild, userId){
  const roleId = process.env.MOST_WANTED_ROLE_ID;
  if (!roleId) return false;
  try {
    const role = guild.roles.cache.get(roleId);
    if (!role) return false;
    // remove from others
    for (const m of role.members.values()){
      if (m.id !== userId) {
        try { await m.roles.remove(roleId); } catch {}
      }
    }
    const member = await guild.members.fetch(userId).catch(()=>null);
    if (!member) return false;
    if (!member.roles.cache.has(roleId)){
      await member.roles.add(roleId).catch(()=>{});
    }
    return true;
  } catch { return false; }
}

export default {
  data: new SlashCommandBuilder()
    .setName('mostwanted')
    .setDescription('Show the current Most Wanted (top robber)')
    .addStringOption(o =>
      o.setName('period')
       .setDescription('Time window')
       .addChoices(
         { name: 'last 7 days', value: '7d' },
         { name: 'last 30 days', value: '30d' },
         { name: 'all-time', value: 'all' },
       )
    ),
  async execute(interaction){
    const period = interaction.options.getString('period') || '7d';
    const db = getDB();
    const since = cutoffFromPeriod(period);
    const rows = since
      ? db.prepare(`
          SELECT user_id, SUM(amount) AS stolen
          FROM txns
          WHERE created_at >= ? AND reason = 'robbery_gain'
          GROUP BY user_id
          ORDER BY stolen DESC
          LIMIT 1
        `).all(since)
      : db.prepare(`
          SELECT user_id, SUM(amount) AS stolen
          FROM txns
          WHERE reason = 'robbery_gain'
          GROUP BY user_id
          ORDER BY stolen DESC
          LIMIT 1
        `).all();

    if (!rows.length || !rows[0]?.user_id){
      return interaction.reply({ content: 'No Most Wanted yet for this period.', ephemeral: true });
    }

    const top = rows[0];
    const profile = getCrimeProfile(top.user_id);
    const title = '🚨 Most Wanted';
    const e = new EmbedBuilder()
      .setTitle(title)
      .setDescription([
        `Suspect: <@${top.user_id}>`,
        `Stolen ${period==='all'?'(all-time)':`(${period})`}: **${top.stolen || 0}**`,
        `Heat: **${profile.heat}** • Crimes: **${profile.successes}**✓ / **${profile.fails}**✗`,
      ].join('\n'))
      .setTimestamp(Date.now());

    // Try to apply Most Wanted role if configured
    const applied = await applyMostWantedRole(interaction.guild, top.user_id);
    if (applied) e.setFooter({ text: 'Role updated: MOST_WANTED_ROLE_ID' });

    return interaction.reply({ embeds: [e] });
  }
}

