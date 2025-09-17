import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('Help');

// Member-facing categories (admin lives in /helpadmin)
const HELP_ORDER = [
  'top',
  'economy',
  'casino',
  'profile',
  'jobs',
  'quests',
  'moderation',
  'streaming',
  'fun',
  'utilities'
];

function navTargets(current) {
  const idx = HELP_ORDER.indexOf(current);
  const prev = HELP_ORDER[(idx - 1 + HELP_ORDER.length) % HELP_ORDER.length];
  const next = HELP_ORDER[(idx + 1) % HELP_ORDER.length];
  return { prev, next };
}

function displayLabel(key) {
  if (key === 'top') return 'Top Commands';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function categorySelectRow(currentKey) {
  const opts = [
    { label: 'Top Commands', value: 'top', description: 'Frequently used commands' },
    { label: 'Economy', value: 'economy', description: 'Money management commands' },
    { label: 'Casino', value: 'casino', description: 'Gambling and games of chance' },
    { label: 'Profile', value: 'profile', description: 'User profiles and inventory' },
    { label: 'Jobs', value: 'jobs', description: 'Jobs system and work commands' },
    { label: 'Quests', value: 'quests', description: 'Quests and achievements' },
    { label: 'Moderation', value: 'moderation', description: 'Moderation tools' },
    { label: 'Streaming', value: 'streaming', description: 'Twitch and YouTube integration' },
    { label: 'Fun', value: 'fun', description: 'Fun and entertainment commands' },
    { label: 'Utilities', value: 'utilities', description: 'Utility commands' },
  ].map(o => ({ ...o, default: o.value === currentKey }));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_category')
      .setPlaceholder(displayLabel(currentKey))
      .addOptions(opts)
  );
}

function navButtonsRow(currentKey) {
  const { prev, next } = navTargets(currentKey);
  const page = HELP_ORDER.indexOf(currentKey) + 1;
  const total = HELP_ORDER.length;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`help_nav:${currentKey}:prev`)
      .setLabel(`< ${displayLabel(prev)}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('help_pager_disabled')
      .setLabel(`${displayLabel(currentKey)} (${page}/${total})`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`help_nav:${currentKey}:next`)
      .setLabel(`${displayLabel(next)} >`)
      .setStyle(ButtonStyle.Secondary)
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Display information about available commands')
    .addStringOption(option => 
      option.setName('category')
        .setDescription('Command category')
        .setRequired(false)
        .addChoices(
          { name: 'Top Commands', value: 'top' },
          { name: 'Economy', value: 'economy' },
          { name: 'Casino', value: 'casino' },
          { name: 'Profile', value: 'profile' },
          { name: 'Quests', value: 'quests' },
          { name: 'Jobs', value: 'jobs' },
          { name: 'Moderation', value: 'moderation' },
          { name: 'Streaming', value: 'streaming' },
          { name: 'Fun', value: 'fun' },
          { name: 'Utilities', value: 'utilities' }
        )),

  async execute(interaction) {
    const category = interaction.options.getString('category') || 'top';
    const { embed, components } = buildCategoryView(category);
    await interaction.reply({ embeds: [embed], components });
  },

  async handleInteraction(interaction) {
    if (interaction.isStringSelectMenu() && interaction.customId === 'help_category') {
      const category = interaction.values[0];
      const { embed, components } = buildCategoryView(category);
      return interaction.update({ embeds: [embed], components });
    }
    if (interaction.isButton() && interaction.customId.startsWith('help_nav:')) {
      const [, currentKey, action] = interaction.customId.split(':');
      const { prev, next } = navTargets(currentKey);
      const target = action === 'prev' ? prev : next;
      const { embed, components } = buildCategoryView(target);
      return interaction.update({ embeds: [embed], components });
    }
    if (interaction.isButton() && interaction.customId.startsWith('help_dm:')) {
      const [, category] = interaction.customId.split(':');
      const { embed } = buildCategoryView(category);
      try {
        await interaction.user.send({ embeds: [embed] });
        return interaction.reply({ content: 'Sent to your DMs.' });
      } catch {
        return interaction.reply({ content: 'Could not DM you. Check your privacy settings.' });
      }
    }
  }
};

function buildCategoryView(category) {
  if (!HELP_ORDER.includes(category)) category = 'top';
  const embed = new EmbedBuilder().setColor('#5865F2');

  if (category === 'top') {
    const botName = process.env.BOT_NAME || 'Cr3ative BOT';
    embed
      .setTitle(`${botName} Help`)
      .setDescription([
        'Your most useful actions right now:',
        '',
        'Quick Actions',
        '/work - start a paid shift',
        '/job stats - see your tier, earnings, and cooldown',
        '/daily - claim daily reward with streak bonus',
        '/balance - check wallet and bank',
        '/rankcard - share your rank image',
        '/quests claim - claim 1 ready quest(s)',
        '/shop list - browse items; /inventory - see items',
        '/helpadmin - admin/mod/events help'
      ].join('\n'))
      .setFooter({ text: 'Use buttons or the menu to browse categories' });
  } else {
    fillCategoryEmbed(embed, category);
  }

  const dmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`help_dm:${category}`)
      .setLabel('DM this page')
      .setStyle(ButtonStyle.Primary)
  );

  const components = [navButtonsRow(category), categorySelectRow(category), dmRow];
  return { embed, components };
}

function fillCategoryEmbed(embed, category) {
  embed
    .setTitle(`${category.charAt(0).toUpperCase() + category.slice(1)} Commands`)
    .setFooter({ text: 'Use buttons or the menu to browse categories' });

  switch (category) {
    case 'economy':
      embed.setDescription('Core money actions').addFields({ name: 'Commands', value: '`/balance`, `/daily`, `/work`, `/deposit`, `/withdraw`, `/give`, `/leaderboard`', inline: false });
      break;

    case 'casino':
      embed.setDescription('Games of chance').addFields({ name: 'Commands', value: '`/blackjack`, `/roulette`, `/slots`, `/coinflip`, `/mines`, `/crash`, `/lottery`, `/wager`', inline: false });
      break;

    case 'profile':
      embed.setDescription('Profile and items').addFields({ name: 'Commands', value: '`/profile`, `/inventory`, `/shop list`, `/shop info`, `/shop buy`, `/rankcard`', inline: false });
      break;

    case 'jobs':
      embed.setDescription('Work and career').addFields({ name: 'Commands', value: '`/job list`, `/job info`, `/job apply`, `/job stats`', inline: false });
      break;

    case 'quests':
      embed.setDescription('Quests and achievements').addFields({ name: 'Commands', value: '`/quests view`, `/quests claim`, `/achievements`, `/questleaderboard`', inline: false });
      break;

    case 'moderation':
      embed.setDescription('Moderation tools').addFields({ name: 'Commands', value: '`/ban`, `/kick`, `/timeout`, `/modlog set`, `/modlog view`, `/modlog reason`', inline: false });
      break;

    case 'streaming':
      embed.setDescription('Twitch/YouTube integration').addFields({ name: 'Commands', value: '`/stream status`, `/stream clip`, `/stream link`, `/streamrole join`, `/streamrole leave`', inline: false });
      break;

    case 'fun':
      embed.setDescription('Just for fun').addFields({ name: 'Commands', value: '`/8ball`, `/avatar`, `/meme`, `/pokemon`', inline: false });
      break;

    case 'utilities':
      embed.setDescription('Utilities and info').addFields({ name: 'Commands', value: '`/ping`, `/aboutbot`, `/help`', inline: false });
      break;
  }
}
