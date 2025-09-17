import { SlashCommandBuilder } from 'discord.js';
import { createLogger } from '../../utils/logger.js';
import { EPHEMERAL } from '../../utils/flags.js';

const logger = createLogger('Cmd/streamrole');

async function handleJoin(interaction) {
  const roleId = process.env.STREAM_ROLE_ID;
  if (!roleId) return interaction.reply({ content: 'Stream notification role is not configured.', flags: EPHEMERAL });

  try {
    const role = await interaction.guild.roles.fetch(roleId);
    if (!role) return interaction.reply({ content: 'Stream notification role not found.', flags: EPHEMERAL });

    const member = interaction.member;
    if (member.roles.cache.has(roleId)) return interaction.reply({ content: 'You already have the stream notification role!', flags: EPHEMERAL });

    await member.roles.add(role);
    return interaction.reply({ content: 'You will now be notified when the stream goes live!', flags: EPHEMERAL });
  } catch (e) {
    logger.error('join error', e);
    return interaction.reply({ content: 'An error occurred while adding the role. Please try again later.', flags: EPHEMERAL });
  }
}

async function handleLeave(interaction) {
  const roleId = process.env.STREAM_ROLE_ID;
  if (!roleId) return interaction.reply({ content: 'Stream notification role is not configured.', flags: EPHEMERAL });

  try {
    const role = await interaction.guild.roles.fetch(roleId);
    if (!role) return interaction.reply({ content: 'Stream notification role not found.', flags: EPHEMERAL });

    const member = interaction.member;
    if (!member.roles.cache.has(roleId)) return interaction.reply({ content: "You don't have the stream notification role!", flags: EPHEMERAL });

    await member.roles.remove(role);
    return interaction.reply({ content: 'You will no longer be notified when the stream goes live.', flags: EPHEMERAL });
  } catch (e) {
    logger.error('leave error', e);
    return interaction.reply({ content: 'An error occurred while removing the role. Please try again later.', flags: EPHEMERAL });
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('streamrole')
    .setDescription('Manage stream notification roles')
    .addSubcommand(s => s.setName('join').setDescription('Get notified when the stream goes live'))
    .addSubcommand(s => s.setName('leave').setDescription('Stop receiving stream notifications')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'join') return handleJoin(interaction);
    if (sub === 'leave') return handleLeave(interaction);
  }
};

