import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  StringSelectMenuBuilder,
} from 'discord.js';
import { safeReply } from '../../utils/interactions.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { PermissionFlagsBits } from 'discord.js';
import { getUserJob } from '../../utils/jobs.js';
import { getQuests } from '../../utils/quests.js';

// ordered pages for the carousel
const PAGES = [
  { id: 'top',         label: 'Top Commands' },
  { id: 'economy',     label: 'Economy' },
  { id: 'jobs',        label: 'Jobs' },
  { id: 'levels',      label: 'Levels' },
  { id: 'engagement',  label: 'Quests & Achievements' },
  { id: 'profile',     label: 'Profile' },
  { id: 'social',      label: 'Social Games' },
  { id: 'utils',       label: 'Utilities' },
  { id: 'casino',      label: 'Casino' },
];

// build the row: ◀ [Label (i/N)] ▶
function navComponents(index = 0) {
  const total = PAGES.length;
  const page = PAGES[index];

  const prev = new ButtonBuilder()
    .setCustomId('help_prev')
    .setEmoji('◀️')
    .setStyle(ButtonStyle.Secondary);

  const label = new ButtonBuilder()
    .setCustomId('help_label')
    .setLabel(`${page.label} (${index + 1}/${total})`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const next = new ButtonBuilder()
    .setCustomId('help_next')
    .setEmoji('▶️')
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(prev, label, next);

  const select = new StringSelectMenuBuilder()
    .setCustomId('help_jump')
    .setPlaceholder('Jump to category')
    .addOptions(
      PAGES.map((p, i) => ({ label: p.label, value: p.id, description: `Open ${p.label}`, default: i === index }))
    );
  const row2 = new ActionRowBuilder().addComponents(select);

  const dm = new ButtonBuilder()
    .setCustomId('help_dm')
    .setLabel('DM this page')
    .setStyle(ButtonStyle.Primary);
  const row3 = new ActionRowBuilder().addComponents(dm);

  return [row1, row2, row3];
}

function renderPage(category, ctx) {
  const embed = new EmbedBuilder().setTitle('Cr3ative BOT • Help');

  switch (category) {
    case 'top': {
      try {
        const user = ctx?.user;
        const guildId = ctx?.guildId;
        const job = user ? getUserJob(user.id) : null;
        let ready = 0;
        try {
          if (guildId && user) {
            const { daily, weekly } = getQuests(guildId, user.id);
            ready = daily.filter(q=> q.progress>=q.target && !q.claimed).length + weekly.filter(q=> q.progress>=q.target && !q.claimed).length;
          }
        } catch {}
        const isAdmin = !!ctx?.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);
        const lines = [];
        if (!job) {
          lines.push('• /job apply — pick a job (auto-selects best)');
        } else {
          lines.push('• /work — start a paid shift');
          lines.push('• /job stats — see your tier, earnings, and cooldown');
        }
        lines.push('• /daily — claim daily reward with streak bonus');
        lines.push('• /balance — check wallet and bank');
        lines.push('• /rankcard — share your rank image');
        lines.push(ready > 0 ? `• /quests claim — claim ${ready} ready quest(s)` : '• /quests view — check today’s quests');
        lines.push('• /shop list — browse items; /inventory — see items');
        if (isAdmin) lines.push('• /helpadmin — admin/mod/events help');
        embed.setDescription('Your most useful actions right now:')
             .addFields({ name: 'Quick Actions', value: lines.join('\n') });
      } catch {
        embed.setDescription('Quick actions: /daily, /work, /balance, /quests view, /rankcard, /shop list');
      }
      break;
    }
    case 'economy':
      embed
        .setDescription('Economy: earn, store, and transfer coins. Daily claims include a streak bonus.')
        .addFields(
          { name: '/balance', value: 'Check wallet and bank' },
          { name: '/daily', value: 'Claim daily reward (streak bonus applies)' },
          { name: '/streak', value: 'View current streak, next bonus, and cooldown' },
          { name: '/transactions', value: 'See recent economy transactions' },
          { name: '/deposit', value: 'Move coins to bank' },
          { name: '/withdraw', value: 'Move coins to wallet' },
          { name: '/give', value: 'Send coins to another user' },
          { name: '/leaderboard type:coins', value: 'Top richest users (wallet + bank)' },
          { name: 'Quick Tips', value: 'Wallet only risks; bank is safe. Use /deposit after wins.' },
        );
      break;

    case 'jobs':
      embed
        .setDescription('Jobs: pick a job and get paid per shift. Promotions and events boost payouts.')
        .addFields(
          { name: '/job list', value: 'Browse available jobs' },
          { name: '/job apply [id]', value: 'Apply (omit id to auto-pick best)' },
          { name: '/job stats', value: 'Your job, tier, works, earnings, cooldown' },
          { name: '/work', value: 'Start a shift; shift events and promotions may trigger' },
        );
      break;

    case 'levels':
      embed
        .setDescription('Levels: gain XP from chatting; level up, earn role rewards, and share rank cards.')
        .addFields(
          { name: '/level', value: 'Your level, XP, progress, and rank' },
          { name: '/leaderboard type:xp', value: 'Top XP in this server' },
          { name: '/levelprofile', value: 'Level details + daily streak' },
          { name: '/levelsettings pings <off|on|announce|dm>', value: 'Choose where your level-up message goes' },
          { name: '/levelsettings view', value: 'See your setting and server defaults' },
          { name: '/rankcard [user]', value: 'Generate a shareable rank card image' },
        )
        .setFooter({ text: 'Tip: "on" uses the server default (#level-ups). "announce" posts in-channel. "dm" sends you a DM.' });
      break;

    case 'engagement':
      embed
        .setDescription('Quests & Achievements: complete rotating tasks and unlock achievements for rewards.')
        .addFields(
          { name: '/quests view', value: 'View daily/weekly quests (with Claim/Refresh buttons)' },
          { name: '/quests claim', value: 'Claim all completed quest rewards' },
          { name: '/questleaderboard [period]', value: 'Quest points leaderboard (1 daily, 3 weekly)' },
          { name: '/achievements [user]', value: 'View unlocked and locked achievements' },
        );
      break;

    case 'events':
      embed
        .setDescription('Events: server-wide XP boost with live scoreboard (admin starts/ends).')
        .addFields(
          { name: '/event start', value: 'Start an event (multiplier, duration, optional name/channel)' },
          { name: '/event status', value: 'Show current event status (private)' },
          { name: '/event postscore', value: 'Post live scoreboard (top 10)' },
          { name: '/event end', value: 'End the current event' },
        );
      break;

    case 'casino':
      embed
        .setDescription('Casino games with light house fees; a share of house profit powers the lottery. Use /casinohelp for rules.')
        .addFields(
          { name: '/blackjack bet:<n>', value: '3:2 payout; Hit/Stand/Double (provably fair seed shown)' },
          { name: '/roulette bet:<n> type:<red|black|odd|even|low|high|straight> [number]', value: 'Single-bet roulette spin' },
          { name: '/coinflip bet:<n> side:<heads|tails>', value: 'Flip vs house' },
          { name: '/slots', value: 'All three lines active; RTP-tuned' },
          { name: '/mines', value: 'Cash out before a bomb; losses feed lottery' },
          { name: '/lottery / /lottohistory', value: 'Jackpot grows from tickets + house profit' },
          { name: '/casinostats', value: 'Your stats (slots for now)' },
          { name: 'Quick Tips', value: 'Small fees apply; a portion of house profit feeds the lottery. Wallet risks only — consider /deposit after wins.' },
        )
        .setFooter({ text: 'Note: Crash is temporarily disabled while tuning' });
      break;

    case 'social':
      embed
        .setDescription('Player vs player and co‑op mini‑games with lobbies and buttons.')
        .addFields(
          { name: '/wager @user bet:<n>', value: 'Best‑of‑3 wager with escrow' },
          { name: '/race bet:<n> [duration]', value: 'Create a joinable race; winner takes 90%' },
          { name: '/heist bet:<n> [duration]', value: 'Co‑op roles (Driver/Hacker/Inside); shared payout' },
          { name: '/crime / /rob', value: 'Quick crime or rob wallet (bank is safe)' },
          { name: '/laylow / /crimeprofile', value: 'Reduce heat or view crime stats' },
          { name: '/leaderboard type:crime period:7d', value: 'Top stolen this week' },
          { name: '/mostwanted [period]', value: 'Show the current Most Wanted (top robber)' },
        );
      break;

    case 'profile':
      embed
        .setDescription('Profile & items: manage your items and view your profile.')
        .addFields(
          { name: '/profile', value: 'View your profile' },
          { name: '/inventory [user]', value: 'See your items (or another user)' },
          { name: '/shop list', value: 'Browse the shop items' },
          { name: '/shop info id:<id>', value: 'View item details' },
          { name: '/shop buy id:<id> [qty]', value: 'Purchase an item (some grant roles)' },
          { name: '/titles / /badges', value: 'Set your profile title and badges' },
          { name: '/craft recipes / /craft make', value: 'Craft items and cosmetics' },
          { name: '/pet adopt|info|feed|play|train', value: 'Adopt and care for a pet (small Work boost)' },
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

    case 'utils':
      embed
        .setDescription('Utilities and general bot info.')
        .addFields(
          { name: '/ping', value: 'Latency check' },
          { name: '/aboutbot', value: 'Version and details' },
          { name: 'More leaderboards', value: '`/leaderboard type:lottery period:7d` • weekly biggest wins\n`/leaderboard type:events event:"Summer Event"` • top event scores' },
        );
      break;

    case 'admin':
      embed
        .setDescription('Admin tools (requires OWNER_ID/ADMIN_ROLE_IDS).')
        .addFields(
          // economy admin
          { name: '/ecoadmin add', value: 'Add to wallet' },
          { name: '/ecoadmin remove', value: 'Remove from wallet' },
          { name: '/ecoadmin setwallet', value: 'Set wallet amount' },
          { name: '/ecoadmin setbank', value: 'Set bank amount' },
          { name: '/ecoadmin resetdaily', value: 'Reset daily cooldown' },
          { name: '/ecoadmin resetstreak', value: 'Reset streak only' },
          { name: '/ecoadmin bonus', value: 'Grant a bonus' },
          // leveling admin (minimal)
          { name: '/leveladmin set-levelups-channel', value: 'Set default #level-ups destination' },
          { name: '/leveladmin set-clips-channel', value: 'Set #clips for DM mode' },
          { name: '/leveladmin set-level', value: 'Set a user’s exact level' },
          { name: '/leveladmin add-xp / remove-xp / reset', value: 'Adjust or reset XP' },
          { name: '/leveladmin view', value: 'Show current server level settings' },
        );
      break;

    default:
      return renderPage('economy');
  }

  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Browse bot features with left/right pages.'),
  async execute(interaction) {
    // start on the first page
    let index = 0;

    // Acknowledge fast to avoid token expiry; then edit
    let acknowledged = false;
    try { await interaction.deferReply(); acknowledged = true; } catch {}
    const payload = { embeds: [renderPage(PAGES[index].id, interaction)], components: navComponents(index) };
    if (acknowledged) {
      await interaction.editReply(payload);
    } else {
      await safeReply(interaction, payload);
    }
    const msg = await interaction.fetchReply().catch(()=>null);
    if (!msg) return; // failed to send, abort setting up collector

    // only the invoker can interact with THIS help message
    const filter = (i) =>
      i.user.id === interaction.user.id &&
      i.message.id === msg.id &&
      (i.customId === 'help_prev' || i.customId === 'help_next' || i.customId === 'help_jump' || i.customId === 'help_dm');

    const collector = msg.createMessageComponentCollector({ filter, time: 5 * 60 * 1000 });

    collector.on('collect', async (i) => {
      if (i.customId === 'help_prev') {
        index = (index - 1 + PAGES.length) % PAGES.length; // wrap-around
        return i.update({ embeds: [renderPage(PAGES[index].id, i)], components: navComponents(index) });
      }
      if (i.customId === 'help_next') {
        index = (index + 1) % PAGES.length; // wrap-around
        return i.update({ embeds: [renderPage(PAGES[index].id, i)], components: navComponents(index) });
      }
      if (i.customId === 'help_jump' && i.isStringSelectMenu()){
        const val = i.values?.[0];
        const idx = PAGES.findIndex(p => p.id === val);
        if (idx >= 0) index = idx;
        return i.update({ embeds: [renderPage(PAGES[index].id, i)], components: navComponents(index) });
      }
      if (i.customId === 'help_dm' && i.isButton()){
        try {
          await i.user.send({ embeds: [renderPage(PAGES[index].id, i)] });
          return i.reply({ content: 'Sent to your DMs ✅', flags: EPHEMERAL });
        } catch {
          return i.reply({ content: 'Could not DM you. Are DMs disabled?', flags: EPHEMERAL });
        }
      }
    });

    collector.on('end', async () => {
      try {
        // disable all controls when the collector ends
        const [row1, row2, row3] = navComponents(index);
        const disabledRow1 = new ActionRowBuilder().addComponents(
          ...row1.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
        );
        const disabledRow2 = new ActionRowBuilder().addComponents(
          ...row2.components.map((c) => StringSelectMenuBuilder.from(c).setDisabled(true))
        );
        const disabledRow3 = new ActionRowBuilder().addComponents(
          ...row3.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
        );
        await msg.edit({ components: [disabledRow1, disabledRow2, disabledRow3] });
      } catch {
        // ignore if message was deleted or already edited
      }
    });
  },
};
