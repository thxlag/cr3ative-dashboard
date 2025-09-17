import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';
import { levelFromTotalXp } from '../../utils/leveling.js';
import { generateRankCard } from '../../utils/rankcard.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rankcard')
    .setDescription('Generate a shareable rank card image')
    .addUserOption(o => o.setName('user').setDescription('Another user').setRequired(false)),
  async execute(interaction){
    const user = interaction.options.getUser('user') || interaction.user;
    // Canvas rendering can take >3s. Defer to acknowledge immediately.
    await interaction.deferReply();
    const guildId = interaction.guildId;
    const db = getDB();

    const lv = db.prepare('SELECT xp FROM levels WHERE guild_id = ? AND user_id = ?')
      .get(guildId, user.id) || { xp: 0 };
    const st = levelFromTotalXp(lv.xp || 0);

    const rank = (db.prepare('SELECT COUNT(*) AS c FROM levels WHERE guild_id = ? AND xp > ?')
      .get(guildId, lv.xp || 0).c || 0) + 1;

    const eco = db.prepare('SELECT (wallet + bank) AS total FROM users WHERE user_id = ?')
      .get(user.id) || { total: 0 };

    const avatarUrl = user.displayAvatarURL({ size: 256, extension: 'png' });

    try {
      const png = await generateRankCard({
        username: user.username,
        avatarUrl,
        level: st.level,
        totalXp: lv.xp || 0,
        current: st.current,
        next: st.next,
        rank,
        coins: eco.total || 0
      });

      const file = new AttachmentBuilder(png, { name: `rank-${user.id}.png` });
      await interaction.editReply({ files: [file] });
    } catch (e) {
      const fallback = `Rank Card\nUser: ${user.username}\nLevel: ${st.level}\nXP: ${lv.xp || 0} (${st.current}/${st.next})\nRank: #${rank}\nCoins: ${eco.total || 0}`;
      await interaction.editReply({ content: fallback });
    }
  }
}
