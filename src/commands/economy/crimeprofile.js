import { SlashCommandBuilder } from 'discord.js';
import { getCrimeProfile, canCrime, canRob } from '../../utils/crime.js';
import { baseEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('crimeprofile').setDescription('Your crime stats, heat, and cooldowns'),
  async execute(interaction){
    const userId = interaction.user.id;
    const p = getCrimeProfile(userId);
    const c1 = canCrime(userId); const c2 = canRob(userId);
    const lines = [];
    lines.push(`Heat: **${p.heat}**`);
    lines.push(`Crimes: **${p.successes}** success • **${p.fails}** fails`);
    lines.push(`Total stolen: **${p.stolen}** • Total lost: **${p.lost}**`);
    if (!c1.ok) lines.push(`Next /crime: **${Math.ceil(c1.remaining/1000)}s**`);
    if (!c2.ok) lines.push(`Next /rob: **${Math.ceil(c2.remaining/1000)}s**`);
    const e = baseEmbed({ title: `${interaction.user.username} • Crime Profile`, description: lines.join('\n'), color: 'info' });
    return interaction.reply({ embeds: [e] });
  }
}

