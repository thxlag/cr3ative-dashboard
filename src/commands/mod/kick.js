import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { createCase, postCaseLog } from '../../utils/modlog.js';

export default {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member and log a case')
    .addUserOption(o => o.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  async execute(interaction){
    const guild = interaction.guild;
    const me = guild.members.me;
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply({ content: 'You need Kick Members permission.', flags: EPHEMERAL });
    }
    if (!me?.permissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply({ content: 'I do not have Kick Members permission.', flags: EPHEMERAL });
    }

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || '';
    if (user.id === interaction.user.id) return interaction.reply({ content: 'You cannot kick yourself.', flags: EPHEMERAL });
    if (user.id === me?.id) return interaction.reply({ content: 'I cannot kick myself.', flags: EPHEMERAL });

    let member = null;
    try { member = await guild.members.fetch(user.id); } catch {}
    if (!member) return interaction.reply({ content: 'User is not a member of this server.', flags: EPHEMERAL });
    if (!member.kickable) return interaction.reply({ content: 'I cannot kick that user (role hierarchy).', flags: EPHEMERAL });

    try {
      await member.kick(reason || undefined);
    } catch {
      return interaction.reply({ content: 'Failed to kick user.', flags: EPHEMERAL });
    }

    const row = createCase(guild, { action: 'kick', targetId: user.id, moderatorId: interaction.user.id, reason });
    await postCaseLog(guild, row);
    return interaction.reply({ content: `Kicked ${user.tag}. Case #${row.case_id}.`, flags: EPHEMERAL });
  }
}
