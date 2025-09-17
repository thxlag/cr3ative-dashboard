import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { version as djsVersion } from 'discord.js';
import { createRequire } from 'node:module';
import os from 'node:os';
import { getDB } from '../../lib/db.js';

const require = createRequire(import.meta.url);
const pkg = require('../../../package.json');

// format helpers
function fmtNumber(n) { return n.toLocaleString(); }
function fmtBytes(bytes) { return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${ss}s`);
  return parts.join(' ');
}

function buildLinks() {
  const row = new ActionRowBuilder();
  const comps = [];
  if (process.env.CLIENT_ID) {
    const invite = `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&scope=bot%20applications.commands`;
    comps.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Invite').setURL(invite));
  }
  if (process.env.SUPPORT_URL) {
    comps.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Support').setURL(process.env.SUPPORT_URL));
  }
  if (process.env.SUBSCRIBE_URL) {
    comps.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Source').setURL(process.env.SUBSCRIBE_URL));
  }
  const rows = [];
  if (comps.length) rows.push(row.addComponents(...comps));
  // Add Patch Notes button
  const r2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('about_patchnotes').setStyle(ButtonStyle.Primary).setLabel('Patch Notes')
  );
  rows.push(r2);
  return rows;
}

export default {
  data: new SlashCommandBuilder()
    .setName('aboutbot')
    .setDescription('Show bot version, uptime, stats, and links'),
  async execute(interaction) {
    const t0 = Date.now();

    await interaction.reply({ content: 'Gathering stats…' });
    const firstMsg = await interaction.fetchReply();
    const roundtrip = firstMsg.createdTimestamp - interaction.createdTimestamp;

    const client = interaction.client;

    // counts
    const guilds = client.guilds.cache.size;
    const approxUsers = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount ?? 0), 0);

    // db stats
    const db = getDB();
    let usersRows = 0, levelsRows = 0;
    try { usersRows = db.prepare('SELECT COUNT(*) AS c FROM users').get().c || 0; } catch {}
    try { levelsRows = db.prepare('SELECT COUNT(*) AS c FROM levels').get().c || 0; } catch {}

    // system stats
    const mem = process.memoryUsage();
    const rss = fmtBytes(mem.rss);
    const heap = fmtBytes(mem.heapUsed);
    const cpuModel = os.cpus()?.[0]?.model || 'CPU';
    const platform = `${os.type()} ${os.release()}`;
    const wsPing = Math.round(client.ws.ping);
    const uptime = fmtUptime(client.uptime || 0);

    const embed = new EmbedBuilder()
      .setTitle('Cr3ative BOT — About')
      .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Version', value: `v${pkg.version}`, inline: true },
        { name: 'discord.js', value: djsVersion, inline: true },
        { name: 'Node.js', value: process.versions.node, inline: true },

        { name: 'Uptime', value: uptime, inline: true },
        { name: 'WS Ping', value: `${wsPing} ms`, inline: true },
        { name: 'Roundtrip', value: `${roundtrip} ms`, inline: true },

        { name: 'Servers', value: fmtNumber(guilds), inline: true },
        { name: 'Users (approx)', value: fmtNumber(approxUsers), inline: true },
        { name: 'Commands', value: fmtNumber(client.commands?.size || 0), inline: true },

        { name: 'DB: Users', value: fmtNumber(usersRows), inline: true },
        { name: 'DB: Levels', value: fmtNumber(levelsRows), inline: true },
        { name: 'Memory', value: `RSS ${rss} • Heap ${heap}`, inline: true },
      )
      .setFooter({ text: `${platform} • ${cpuModel}` })
      .setTimestamp(Date.now());

  const components = buildLinks();

  await interaction.editReply({ content: '', embeds: [embed], components });
  },
};
