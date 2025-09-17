import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { claimAll } from '../../utils/quests.js';
import { incBurstMetric } from '../../utils/events.js';
import { buildQuestsEmbed } from '../../utils/quests_ui.js';
import { EPHEMERAL } from '../../utils/flags.js';

function bar(progress, target, len = 16){
  const pct = Math.max(0, Math.min(1, target ? progress/target : 0));
  const filled = Math.round(pct * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled) + ` ${Math.floor(pct*100)}%`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('quests')
    .setDescription('View and claim daily/weekly quests')
    .addSubcommand(s => s.setName('view').setDescription('Show your quests'))
    .addSubcommand(s => s.setName('claim').setDescription('Claim all completed quest rewards')),
  async execute(interaction){
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (sub === 'view'){
      const embed = buildQuestsEmbed(guildId, interaction.user);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`quests-claim-all:${userId}`).setStyle(ButtonStyle.Success).setLabel('Claim All'),
        new ButtonBuilder().setCustomId(`quests-refresh:${userId}`).setStyle(ButtonStyle.Secondary).setLabel('Refresh')
      );
      return interaction.reply({ embeds: [embed], components: [row], flags: EPHEMERAL });
    }

    if (sub === 'claim'){
      const res = claimAll(guildId, userId);
      if (!res.claimed.length) return interaction.reply({ content: 'Nothing to claim yet.', flags: EPHEMERAL });
      const parts = [];
      if (res.coins) parts.push(`**${res.coins}** coins`);
      if (res.xp) parts.push(`**${res.xp}** XP`);
      try { incBurstMetric(guildId, userId, 'quests', res.claimed.length); } catch {}
      return interaction.reply({ content: `Claimed ${res.claimed.length} quest(s): ${parts.join(' + ') || 'no rewards'}.`, flags: EPHEMERAL });
    }
  }
}
