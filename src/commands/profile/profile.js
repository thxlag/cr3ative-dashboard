import { SlashCommandBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';
import { levelFromTotalXp } from '../../utils/leveling.js';
import { baseEmbed } from '../../utils/embeds.js';
import { getProfileCosmetics } from '../../utils/cosmetics.js';

export default {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your profile: balances, level, items')
    .addUserOption(o => o.setName('user').setDescription('Another user').setRequired(false)),
  async execute(interaction){
    const target = interaction.options.getUser('user') || interaction.user;
    const guildId = interaction.guildId;
    const db = getDB();

    const econ = db.prepare('SELECT wallet, bank, streak FROM users WHERE user_id = ?').get(target.id) || { wallet: 0, bank: 0, streak: 0 };
    const lv = db.prepare('SELECT xp FROM levels WHERE guild_id = ? AND user_id = ?').get(guildId, target.id) || { xp: 0 };
    const st = levelFromTotalXp(lv.xp);

    const invCount = db.prepare('SELECT SUM(qty) AS c FROM user_inventory WHERE user_id = ?').get(target.id)?.c || 0;

    const barLen = 18;
    const filled = Math.round(st.progress * barLen);
    const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);

    const cos = getProfileCosmetics(target.id);
    const title = cos.title ? `${cos.title} • ` : '';
    const badges = (cos.badges||[]).slice(0,3).join(' ');
    const embed = baseEmbed({ title: `${title}${target.username} • Profile`, color: 'info' })
      .setThumbnail(target.displayAvatarURL?.({ size: 128 }))
      .addFields(
        { name: 'Wallet', value: `${econ.wallet}`, inline: true },
        { name: 'Bank', value: `${econ.bank}`, inline: true },
        { name: 'Streak', value: `${econ.streak || 0}`, inline: true },
        { name: 'Level', value: `${st.level}`, inline: true },
        { name: 'Total XP', value: `${lv.xp || 0}`, inline: true },
        { name: 'Items', value: `${invCount || 0}`, inline: true },
      )
      .setDescription([
        `Progress to next: **${Math.floor(st.progress * 100)}%**`,
        `\`${bar}\``,
        `Next level in **${st.next - st.current}** XP`
      ].join('\n'));
    if (badges) embed.addFields({ name: 'Badges', value: badges });

    await interaction.reply({ embeds: [embed] });
  }
}
