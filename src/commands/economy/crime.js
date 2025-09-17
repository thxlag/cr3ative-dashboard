import { SlashCommandBuilder } from 'discord.js';
import { canCrime, attemptCrime } from '../../utils/crime.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { safeReply } from '../../utils/interactions.js';

export default {
  data: new SlashCommandBuilder().setName('crime').setDescription('Attempt a quick hit — success earns coins, failure costs.'),
  async execute(interaction){
    const userId = interaction.user.id;
    const can = canCrime(userId);
    if (!can.ok){
      const s = Math.ceil(can.remaining/1000);
      return safeReply(interaction, { content: `You’re laying low. Try again in **${s}s**.`, flags: EPHEMERAL });
    }
    const res = attemptCrime(userId);
    if (!res.ok) return safeReply(interaction, { content: 'Could not attempt crime now.', flags: EPHEMERAL });
    if (res.success){
      return safeReply(interaction, { content: `✅ You pulled it off: **+${res.delta}** coins. Heat: **${res.heat}**` });
    } else {
      return safeReply(interaction, { content: `🚫 You got caught: **${res.delta}** coins. Heat: **${res.heat}**` });
    }
  }
}

