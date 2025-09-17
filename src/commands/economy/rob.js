import { SlashCommandBuilder } from 'discord.js';
import { canRob, attemptRob } from '../../utils/crime.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { safeReply } from '../../utils/interactions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Attempt to rob someone’s wallet (bank is safe)')
    .addUserOption(o => o.setName('target').setDescription('Who to rob').setRequired(true)),
  async execute(interaction){
    const userId = interaction.user.id;
    const target = interaction.options.getUser('target');
    if (!target || target.bot) return safeReply(interaction, { content: 'Pick a real user.', flags: EPHEMERAL });
    if (target.id === userId) return safeReply(interaction, { content: 'You cannot rob yourself.', flags: EPHEMERAL });

    const cd = canRob(userId);
    if (!cd.ok){
      const s = Math.ceil(cd.remaining/1000);
      return safeReply(interaction, { content: `You need to wait **${s}s** before attempting another robbery.`, flags: EPHEMERAL });
    }

    const res = attemptRob(userId, target.id);
    if (!res.ok){
      if (res.code === 'self_min') return safeReply(interaction, { content: `You need more coins in your wallet to attempt a robbery.`, flags: EPHEMERAL });
      if (res.code === 'target_min') return safeReply(interaction, { content: `That user doesn’t have enough in wallet.`, flags: EPHEMERAL });
      if (res.code === 'cooldown'){ const s = Math.ceil(res.remaining/1000); return safeReply(interaction, { content: `Cooldown: **${s}s** remaining.`, flags: EPHEMERAL }); }
      if (res.code === 'same_target'){ const s = Math.ceil(res.remaining/1000); return safeReply(interaction, { content: `You recently tried this user. Try again in **${s}s**.`, flags: EPHEMERAL }); }
      return safeReply(interaction, { content: 'Could not attempt robbery now.', flags: EPHEMERAL });
    }

    if (res.success){
      return safeReply(interaction, { content: `💰 You robbed ${target} for **${res.amt}** coins (wallet only).` });
    } else {
      return safeReply(interaction, { content: `🚔 Caught! You paid **${res.amt}** coins in fines to ${target}.` });
    }
  }
}

