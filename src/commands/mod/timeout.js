import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { createCase, postCaseLog } from '../../utils/modlog.js';

export default {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member and log a case')
    .addUserOption(o => o.setName('user').setDescription('Member to timeout').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes (1-40320)').setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction){
    const guild = interaction.guild;
    const me = guild.members.me;
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: 'You need Moderate Members permission.', flags: EPHEMERAL });
    }
    if (!me?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: 'I do not have Moderate Members permission.', flags: EPHEMERAL });
    }

    const user = interaction.options.getUser('user', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const reason = interaction.options.getString('reason') || '';
    const ms = Math.max(1, Math.min(minutes, 40320)) * 60 * 1000; // up to 28 days

    if (user.id === interaction.user.id) return interaction.reply({ content: 'You cannot timeout yourself.', flags: EPHEMERAL });
    if (user.id === me?.id) return interaction.reply({ content: 'I cannot timeout myself.', flags: EPHEMERAL });

    let member = null;
    try { member = await guild.members.fetch(user.id); } catch {}
    if (!member) return interaction.reply({ content: 'User is not a member of this server.', flags: EPHEMERAL });
    if (!member.moderatable) return interaction.reply({ content: 'I cannot timeout that user (role hierarchy).', flags: EPHEMERAL });

    try {
      await member.timeout(ms, reason || undefined);
    } catch {
      return interaction.reply({ content: 'Failed to timeout user.', flags: EPHEMERAL });
    }

    const row = createCase(guild, { action: 'timeout', targetId: user.id, moderatorId: interaction.user.id, reason, extra: { minutes } });
    await postCaseLog(guild, row);
    return interaction.reply({ content: `Timed out ${user.tag} for ${minutes} minutes. Case #${row.case_id}.`, flags: EPHEMERAL });
  }
}
