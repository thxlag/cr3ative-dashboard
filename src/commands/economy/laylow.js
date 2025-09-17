import { SlashCommandBuilder } from 'discord.js';
import { layLow } from '../../utils/crime.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { safeReply } from '../../utils/interactions.js';

export default {
  data: new SlashCommandBuilder().setName('laylow').setDescription('Reduce your heat (cooldown applies)'),
  async execute(interaction){
    const userId = interaction.user.id;
    const res = layLow(userId);
    if (!res.ok){
      if (res.code === 'cooldown'){
        const s = Math.ceil(res.remaining/1000);
        return safeReply(interaction, { content: `You recently laid low. Try again in **${s}s**.`, flags: EPHEMERAL });
      }
      return safeReply(interaction, { content: 'Could not lay low now.', flags: EPHEMERAL });
    }
    return safeReply(interaction, { content: `You laid low and reduced your heat by **${res.reduce}**. Current heat: **${res.heat}**.` });
  }
}

