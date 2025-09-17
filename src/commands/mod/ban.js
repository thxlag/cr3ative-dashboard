import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { createCase, postCaseLog } from '../../utils/modlog.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user and log a case')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .addIntegerOption(o => o.setName('delete_days').setDescription('Delete message history (0-7 days)').setMinValue(0).setMaxValue(7).setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction){
    const guild = interaction.guild;
    const me = guild.members.me;
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({ content: 'You need Ban Members permission.', flags: EPHEMERAL });
    }
    if (!me?.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({ content: 'I do not have Ban Members permission.', flags: EPHEMERAL });
    }

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || '';
    const del = interaction.options.getInteger('delete_days') ?? 0;

    if (user.id === interaction.user.id) return interaction.reply({ content: 'You cannot ban yourself.', flags: EPHEMERAL });
    if (user.id === me?.id) return interaction.reply({ content: 'I cannot ban myself.', flags: EPHEMERAL });

    let member = null;
    try { member = await guild.members.fetch(user.id); } catch {}
    if (member && !member.bannable) {
      return interaction.reply({ content: 'I cannot ban that user (role hierarchy).', flags: EPHEMERAL });
    }

    try {
      await guild.members.ban(user.id, { reason: reason || undefined, deleteMessageDays: del });
    } catch (e) {
      return interaction.reply({ content: 'Failed to ban user.', flags: EPHEMERAL });
    }

    const row = createCase(guild, { action: 'ban', targetId: user.id, moderatorId: interaction.user.id, reason });
    await postCaseLog(guild, row);
    return interaction.reply({ content: `Banned ${user.tag}. Case #${row.case_id}.`, flags: EPHEMERAL });
  }
}
