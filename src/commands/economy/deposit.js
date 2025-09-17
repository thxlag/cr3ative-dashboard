import { SlashCommandBuilder } from 'discord.js';
import { transferWalletToBank, getUser } from '../../lib/econ.js';
import { incQuest } from '../../utils/quests.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { safeReply } from '../../utils/interactions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('deposit')
    .setDescription('Deposit coins into bank')
    .addIntegerOption(o => o.setName('amount').setDescription('Amount or 0 for all').setRequired(true)),
  async execute(interaction){
    const amt = interaction.options.getInteger('amount');
    const { wallet } = getUser(interaction.user.id);
    const amount = amt === 0 ? wallet : amt;
    if(amount <= 0) return safeReply(interaction, { content: 'Invalid amount.', flags: EPHEMERAL });
    const ok = transferWalletToBank(interaction.user.id, amount);
    if(!ok) return safeReply(interaction, { content: 'Not enough in wallet.', flags: EPHEMERAL });
    await safeReply(interaction, { content: `Deposited **${amount}** into bank.` });
    try { if (amount >= 500) incQuest(interaction.guildId, interaction.user.id, 'daily_deposit_500', 1); } catch {}
  }
}
