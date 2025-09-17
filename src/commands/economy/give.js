import { SlashCommandBuilder } from 'discord.js';
import { getUser, incWallet } from '../../lib/econ.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { safeReply } from '../../utils/interactions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('give')
    .setDescription('Give coins to another user')
    .addUserOption(o => o.setName('user').setDescription('Recipient').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
  async execute(interaction){
    const recipient = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    if(recipient.bot) return safeReply(interaction, { content: 'No bots.', flags: EPHEMERAL });
    if(amount <= 0) return safeReply(interaction, { content: 'Invalid amount.', flags: EPHEMERAL });
    const sender = getUser(interaction.user.id);
    if(sender.wallet < amount) return safeReply(interaction, { content: 'You do not have enough in your wallet.', flags: EPHEMERAL });
    incWallet(interaction.user.id, -amount, 'gift');
    incWallet(recipient.id, amount, 'gift');
    await safeReply(interaction, { content: `Transferred **${amount}** to ${recipient}.` });
  }
}
