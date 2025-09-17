import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { baseEmbed } from '../../utils/embeds.js';
import { getDB } from '../../lib/db.js';
import { setModlogChannelId, getModlogChannelId, getCase, updateCaseReason, editCaseLogMessage, buildCaseEmbed } from '../../utils/modlog.js';

export default {
  data: new SlashCommandBuilder()
    .setName('modlog')
    .setDescription('Configure and manage moderation logs')
    .addSubcommand(s =>
      s.setName('set')
        .setDescription('Set the modlog channel')
        .addChannelOption(o => o.setName('channel').setDescription('Logs channel').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('recent')
        .setDescription('List the most recent cases')
        .addIntegerOption(o => o.setName('limit').setDescription('How many (max 15)').setRequired(false))
    )
    .addSubcommand(s =>
      s.setName('find')
        .setDescription('Find cases for a user')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
        .addIntegerOption(o => o.setName('limit').setDescription('How many (max 15)').setRequired(false))
    )
    .addSubcommand(s =>
      s.setName('view')
        .setDescription('View a case by ID')
        .addIntegerOption(o => o.setName('id').setDescription('Case ID').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('reason')
        .setDescription('Edit a case reason')
        .addIntegerOption(o => o.setName('id').setDescription('Case ID').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('New reason').setRequired(true))
    ),
  async execute(interaction){
    const member = interaction.member;
    if (!member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'You need Manage Server to use this.', flags: EPHEMERAL });
    }

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (sub === 'set') {
      const ch = interaction.options.getChannel('channel');
      if (!ch?.isTextBased?.()) {
        return interaction.reply({ content: 'Please choose a text channel.', flags: EPHEMERAL });
      }
      setModlogChannelId(guild.id, ch.id);
      return interaction.reply({ content: `Modlog channel set to ${ch}.`, flags: EPHEMERAL });
    }

    if (sub === 'view') {
      const id = interaction.options.getInteger('id');
      const row = getCase(guild.id, id);
      if (!row) return interaction.reply({ content: `Case #${id} not found.`, flags: EPHEMERAL });
      const embed = buildCaseEmbed(row);
      return interaction.reply({ embeds: [embed], flags: EPHEMERAL });
    }

    if (sub === 'reason') {
      const id = interaction.options.getInteger('id');
      const reason = interaction.options.getString('reason');
      const row = getCase(guild.id, id);
      if (!row) return interaction.reply({ content: `Case #${id} not found.`, flags: EPHEMERAL });
      updateCaseReason(guild.id, id, reason);
      const updated = getCase(guild.id, id);
      await editCaseLogMessage(guild, updated);
      return interaction.reply({ content: `Updated reason for Case #${id}.`, flags: EPHEMERAL });
    }

    if (sub === 'recent') {
      const n = Math.min(Math.max(interaction.options.getInteger('limit') || 10, 1), 15);
      const rows = db.prepare(`
        SELECT case_id, action, target_id, moderator_id, reason, created_at
        FROM mod_cases
        WHERE guild_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(guild.id, n);
      if (!rows.length) return interaction.reply({ content: 'No cases yet.', flags: EPHEMERAL });
      const lines = rows.map(r => `#${r.case_id} • ${r.action.toUpperCase()} • <@${r.target_id}> by <@${r.moderator_id}> • ${r.reason?.slice(0,80) || 'no reason'} • <t:${Math.floor(r.created_at/1000)}:R>`);
      const embed = baseEmbed({ title: `${guild.name} • Recent Cases`, color: 'info' }).setDescription(lines.join('\n'));
      return interaction.reply({ embeds: [embed], flags: EPHEMERAL });
    }

    if (sub === 'find') {
      const u = interaction.options.getUser('user', true);
      const n = Math.min(Math.max(interaction.options.getInteger('limit') || 10, 1), 15);
      const rows = db.prepare(`
        SELECT case_id, action, target_id, moderator_id, reason, created_at
        FROM mod_cases
        WHERE guild_id = ? AND target_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(guild.id, u.id, n);
      if (!rows.length) return interaction.reply({ content: `No cases found for ${u}.`, flags: EPHEMERAL });
      const lines = rows.map(r => `#${r.case_id} • ${r.action.toUpperCase()} • by <@${r.moderator_id}> • ${r.reason?.slice(0,80) || 'no reason'} • <t:${Math.floor(r.created_at/1000)}:R>`);
      const embed = baseEmbed({ title: `${guild.name} • Cases for ${u.username}`, color: 'info' }).setDescription(lines.join('\n'));
      return interaction.reply({ embeds: [embed], flags: EPHEMERAL });
    }
  }
}
