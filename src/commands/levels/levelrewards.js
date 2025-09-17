import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { isAdmin } from '../../utils/perm.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelrewards')
    .setDescription('Admin: manage role rewards by level')
    .addSubcommand(s =>
      s.setName('add')
       .setDescription('Grant a role when users reach a level')
       .addIntegerOption(o=>o.setName('level').setDescription('Level threshold (>=1)').setRequired(true))
       .addRoleOption(o=>o.setName('role').setDescription('Role to grant').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('remove')
       .setDescription('Remove a role reward mapping')
       .addIntegerOption(o=>o.setName('level').setDescription('Level threshold').setRequired(true))
       .addRoleOption(o=>o.setName('role').setDescription('Role to remove').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('list')
       .setDescription('Show configured level role rewards')
    ),
  async execute(interaction){
    if (!isAdmin(interaction)) {
      return interaction.reply({ content: 'You do not have permission to use this.', flags: EPHEMERAL });
    }
    const db = getDB();
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const level = interaction.options.getInteger('level');
      const role = interaction.options.getRole('role');
      if (level < 1) return interaction.reply({ content: 'Level must be ≥ 1.', flags: EPHEMERAL });
      db.prepare(`
        INSERT INTO level_role_rewards (guild_id, level, role_id)
        VALUES (?, ?, ?)
        ON CONFLICT(guild_id, level, role_id) DO NOTHING
      `).run(guildId, level, role.id);
      return interaction.reply({ content: `Added reward: Level **${level}** ➜ ${role}`, flags: EPHEMERAL });
    }

    if (sub === 'remove') {
      const level = interaction.options.getInteger('level');
      const role = interaction.options.getRole('role');
      db.prepare(`DELETE FROM level_role_rewards WHERE guild_id = ? AND level = ? AND role_id = ?`)
        .run(guildId, level, role.id);
      return interaction.reply({ content: `Removed reward: Level **${level}** ➜ ${role}`, flags: EPHEMERAL });
    }

    if (sub === 'list') {
      const rows = db.prepare(`SELECT level, role_id FROM level_role_rewards WHERE guild_id = ? ORDER BY level ASC`)
        .all(guildId);
      if (!rows.length) return interaction.reply({ content: 'No level rewards configured yet.', flags: EPHEMERAL });

      const lines = rows.map(r => `Level **${r.level}** ➜ <@&${r.role_id}>`);
      const embed = new EmbedBuilder()
        .setTitle(`${interaction.guild.name} • Level Role Rewards`)
        .setDescription(lines.join('\n'));
      return interaction.reply({ embeds: [embed], flags: EPHEMERAL });
    }
  }
}