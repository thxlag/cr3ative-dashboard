import { SlashCommandBuilder } from 'discord.js';
import { transferBankToWallet, getUser } from '../../lib/econ.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { safeReply } from '../../utils/interactions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('Withdraw coins from bank')
    .addIntegerOption(o => o.setName('amount').setDescription('Amount or 0 for all').setRequired(true)),
  async execute(interaction){
    const amt = interaction.options.getInteger('amount');
    const { bank } = getUser(interaction.user.id);
    const amount = amt === 0 ? bank : amt;
    if(amount <= 0) return safeReply(interaction, { content: 'Invalid amount.', flags: EPHEMERAL });
    const ok = transferBankToWallet(interaction.user.id, amount);
    if(!ok) return safeReply(interaction, { content: 'Not enough in bank.', flags: EPHEMERAL });
    await safeReply(interaction, { content: `Withdrew **${amount}** into wallet.` });
  }
}
