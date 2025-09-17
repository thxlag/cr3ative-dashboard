import { SlashCommandBuilder } from 'discord.js';
import { getUser } from '../../lib/econ.js';
import { getDB } from '../../lib/db.js';
import { baseEmbed } from '../../utils/embeds.js';
import { safeReply } from '../../utils/interactions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your wallet and bank balance')
    .addUserOption(opt => opt.setName('user').setDescription('Another user').setRequired(false)),
  async execute(interaction){
    const user = interaction.options.getUser('user') || interaction.user;
    const econ = getUser(user.id);
    const db = getDB();
    const meta = db.prepare('SELECT streak FROM users WHERE user_id = ?').get(user.id) || { streak: 0 };

    const embed = baseEmbed({ title: `${user.username}'s Balance`, color: 'info' })
      .addFields(
        { name: 'Wallet', value: econ.wallet.toString(), inline: true },
        { name: 'Bank', value: econ.bank.toString(), inline: true },
        { name: 'Streak', value: String(meta.streak || 0), inline: true }
      )
      .setDescription('Use /work and /daily to earn coins. Keep your streak alive for bigger bonuses.');

    await safeReply(interaction, { embeds: [embed] });
  }
}
