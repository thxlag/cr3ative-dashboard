import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  StringSelectMenuBuilder,
} from 'discord.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { PermissionFlagsBits } from 'discord.js';

const PAGES = [
  { id: 'events',     label: 'Events' },
  { id: 'moderation', label: 'Moderation' },
  { id: 'admin',      label: 'Admin' },
];

function navComponents(index = 0) {
  const total = PAGES.length;
  const page = PAGES[index];

  const prev = new ButtonBuilder().setCustomId('help_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary);
  const label = new ButtonBuilder().setCustomId('help_label').setLabel(`${page.label} (${index + 1}/${total})`).setStyle(ButtonStyle.Secondary).setDisabled(true);
  const next = new ButtonBuilder().setCustomId('help_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary);
  const row1 = new ActionRowBuilder().addComponents(prev, label, next);

  const select = new StringSelectMenuBuilder()
    .setCustomId('help_jump')
    .setPlaceholder('Jump to category')
    .addOptions(PAGES.map((p, i) => ({ label: p.label, value: p.id, description: `Open ${p.label}`, default: i === index })));
  const row2 = new ActionRowBuilder().addComponents(select);

  const dm = new ButtonBuilder().setCustomId('help_dm').setLabel('DM this page').setStyle(ButtonStyle.Primary);
  const row3 = new ActionRowBuilder().addComponents(dm);
  return [row1, row2, row3];
}

function renderPage(category) {
  const embed = new EmbedBuilder().setTitle('Cr3ative BOT • Admin Help');
  switch (category) {
    case 'events':
      embed
        .setDescription('Events: server-wide XP boost with live scoreboard (admin starts/ends).')
        .addFields(
          { name: '/event (member)', value: 'Members see current event or scheduler info' },
          { name: '/eventadmin start', value: 'Start an event (type, duration, optional settings)' },
          { name: '/eventadmin status', value: 'Show current event status (admin)' },
          { name: '/eventadmin postscore', value: 'Post live scoreboard (top 10)' },
          { name: '/eventadmin end', value: 'End the current event' },
        );
      break;
    case 'moderation':
      embed
        .setDescription('Moderation: log actions to a modlog channel and manage cases.')
        .addFields(
          { name: '/modlog set #channel', value: 'Set the modlog destination' },
          { name: '/modlog view id:<n>', value: 'View a case' },
          { name: '/modlog reason id:<n> <text>', value: 'Edit a case reason (updates log)' },
          { name: '/ban / /kick / /timeout', value: 'Moderation actions create cases automatically' },
        );
      break;
    case 'admin':
      embed
        .setDescription('Admin tools (requires OWNER_ID/ADMIN_ROLE_IDS).')
        .addFields(
          { name: '/ecoadmin add/remove/setwallet/setbank/resetdaily/bonus', value: 'Economy admin tools' },
          { name: '/leveladmin set-levelups-channel', value: 'Set default #level-ups destination' },
          { name: '/leveladmin set-clips-channel', value: 'Set #clips for DM mode' },
          { name: '/leveladmin set-level', value: 'Set a user’s exact level' },
          { name: '/leveladmin add-xp / remove-xp / reset', value: 'Adjust or reset XP' },
          { name: '/leveladmin view', value: 'Show current server level settings' },
        );
      break;
    default:
      return renderPage('events');
  }
  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('helpadmin')
    .setDescription('Browse admin/mod/events help pages.'),
  async execute(interaction){
    // gate behind Manage Guild by default
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild)){
      return interaction.reply({ content: 'You need Manage Server to use this.', flags: EPHEMERAL });
    }
    let index = 0;
    await interaction.reply({ embeds: [renderPage(PAGES[index].id)], components: navComponents(index), flags: EPHEMERAL });
    const msg = await interaction.fetchReply();
    const filter = (i) => i.user.id === interaction.user.id && i.message.id === msg.id && (i.customId === 'help_prev' || i.customId === 'help_next' || i.customId === 'help_jump' || i.customId === 'help_dm');
    const collector = msg.createMessageComponentCollector({ filter, time: 5 * 60 * 1000 });
    collector.on('collect', async (i) => {
      if (i.customId === 'help_prev') { index = (index - 1 + PAGES.length) % PAGES.length; return i.update({ embeds: [renderPage(PAGES[index].id)], components: navComponents(index) }); }
      if (i.customId === 'help_next') { index = (index + 1) % PAGES.length; return i.update({ embeds: [renderPage(PAGES[index].id)], components: navComponents(index) }); }
      if (i.customId === 'help_jump' && i.isStringSelectMenu()){
        const val = i.values?.[0];
        const idx = PAGES.findIndex(p => p.id === val);
        if (idx >= 0) index = idx;
        return i.update({ embeds: [renderPage(PAGES[index].id)], components: navComponents(index) });
      }
      if (i.customId === 'help_dm' && i.isButton()){
        try { await i.user.send({ embeds: [renderPage(PAGES[index].id)] }); return i.reply({ content: 'Sent to your DMs ✅', flags: EPHEMERAL }); }
        catch { return i.reply({ content: 'Could not DM you. Are DMs disabled?', flags: EPHEMERAL }); }
      }
    });
    collector.on('end', async () => {
      try {
        const [row1, row2, row3] = navComponents(index);
        const disabledRow1 = new ActionRowBuilder().addComponents(...row1.components.map((b) => ButtonBuilder.from(b).setDisabled(true)));
        const disabledRow2 = new ActionRowBuilder().addComponents(...row2.components.map((c) => StringSelectMenuBuilder.from(c).setDisabled(true)));
        const disabledRow3 = new ActionRowBuilder().addComponents(...row3.components.map((b) => ButtonBuilder.from(b).setDisabled(true)));
        await msg.edit({ components: [disabledRow1, disabledRow2, disabledRow3] });
      } catch {}
    });
  }
}
