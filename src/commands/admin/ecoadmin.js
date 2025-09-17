import { SlashCommandBuilder } from 'discord.js';
import { isAdmin } from '../../utils/perm.js';
import { incWallet, setWallet, setBank, setLastDaily } from '../../lib/econ.js';
import { getDB } from '../../lib/db.js';
import { EPHEMERAL } from '../../utils/flags.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ecoadmin')
    .setDescription('Admin tools for the economy')
    .addSubcommand(s =>
      s.setName('add')
       .setDescription('Add to a user\'s wallet')
       .addUserOption(o=>o.setName('user').setDescription('Target user').setRequired(true))
       .addIntegerOption(o=>o.setName('amount').setDescription('Amount to add').setRequired(true))
       .addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(false))
    )
    .addSubcommand(s =>
      s.setName('remove')
       .setDescription('Remove from a user\'s wallet')
       .addUserOption(o=>o.setName('user').setDescription('Target user').setRequired(true))
       .addIntegerOption(o=>o.setName('amount').setDescription('Amount to remove').setRequired(true))
       .addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(false))
    )
    .addSubcommand(s =>
      s.setName('setwallet')
       .setDescription('Set user\'s wallet to exact amount')
       .addUserOption(o=>o.setName('user').setDescription('Target user').setRequired(true))
       .addIntegerOption(o=>o.setName('amount').setDescription('New wallet amount').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('setbank')
       .setDescription('Set user\'s bank to exact amount')
       .addUserOption(o=>o.setName('user').setDescription('Target user').setRequired(true))
       .addIntegerOption(o=>o.setName('amount').setDescription('New bank amount').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('resetdaily')
       .setDescription('Reset daily cooldown for a user')
       .addUserOption(o=>o.setName('user').setDescription('Target user').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('bonus')
       .setDescription('Grant a bonus to a user\'s wallet')
       .addUserOption(o=>o.setName('user').setDescription('Target user').setRequired(true))
       .addIntegerOption(o=>o.setName('amount').setDescription('Bonus amount').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('resetstreak')
       .setDescription('Reset streak (not cooldown) for a user')
       .addUserOption(o=>o.setName('user').setDescription('Target user').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('gdp')
       .setDescription('Show economy totals and recent flow (admin)')
       .addStringOption(o=> o.setName('period').setDescription('Time window for flow').addChoices(
         { name: 'all-time', value: 'all' },
         { name: 'last 7 days', value: '7d' },
         { name: 'last 30 days', value: '30d' },
       ))
    ),
  async execute(interaction){
    if (!isAdmin(interaction)) {
      return interaction.reply({ content: 'You do not have permission to use this.', flags: EPHEMERAL });
    }
    const db = getDB();
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user');

    switch(sub){
      case 'add': {
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason') || 'admin add';
        if (amount <= 0) return interaction.reply({ content: 'Amount must be positive.', flags: EPHEMERAL });
        incWallet(user.id, amount, reason);
        return interaction.reply({ content: `Added **${amount}** to ${user}.` });
      }
      case 'remove': {
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason') || 'admin remove';
        if (amount <= 0) return interaction.reply({ content: 'Amount must be positive.', flags: EPHEMERAL });
        incWallet(user.id, -amount, reason);
        return interaction.reply({ content: `Removed **${amount}** from ${user}.` });
      }
      case 'setwallet': {
        const amount = interaction.options.getInteger('amount');
        if (amount < 0) return interaction.reply({ content: 'Amount cannot be negative.', flags: EPHEMERAL });
        // direct set: reuse econ helper via DB to keep things simple
        db.prepare('UPDATE users SET wallet = ? WHERE user_id = ?').run(amount, user.id);
        return interaction.reply({ content: `Set ${user}'s wallet to **${amount}**.` });
      }
      case 'setbank': {
        const amount = interaction.options.getInteger('amount');
        if (amount < 0) return interaction.reply({ content: 'Amount cannot be negative.', flags: EPHEMERAL });
        db.prepare('UPDATE users SET bank = ? WHERE user_id = ?').run(amount, user.id);
        return interaction.reply({ content: `Set ${user}'s bank to **${amount}**.` });
      }
      case 'resetdaily': {
        setLastDaily(user.id, 0);
        return interaction.reply({ content: `Reset daily cooldown for ${user}.` });
      }
      case 'bonus': {
        const amount = interaction.options.getInteger('amount');
        if (amount <= 0) return interaction.reply({ content: 'Amount must be positive.', flags: EPHEMERAL });
        incWallet(user.id, amount, 'admin bonus');
        return interaction.reply({ content: `Granted a **${amount}** bonus to ${user}.` });
      }
      case 'resetstreak': {
        // set streak to 0 and clear the last_claim_day
        db.prepare('UPDATE users SET streak = 0, last_claim_day = NULL WHERE user_id = ?').run(user.id);
        return interaction.reply({ content: `Reset streak for ${user}.` });
      }
      case 'gdp': {
        const period = interaction.options.getString('period') || '7d';
        // Totals
        const totals = db.prepare('SELECT COUNT(*) AS users, SUM(wallet) AS wallet, SUM(bank) AS bank FROM users').get() || { users: 0, wallet: 0, bank: 0 };
        const gdp = (totals.wallet || 0) + (totals.bank || 0);
        // Flow
        let since = null; const DAY = 24*60*60*1000; const now = Date.now();
        if (period === '7d') since = now - 7*DAY; else if (period === '30d') since = now - 30*DAY;
        let pos = 0, neg = 0;
        try {
          if (since){
            pos = db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM txns WHERE created_at >= ? AND amount > 0').get(since).s || 0;
            neg = db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM txns WHERE created_at >= ? AND amount < 0').get(since).s || 0;
          } else {
            pos = db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM txns WHERE amount > 0').get().s || 0;
            neg = db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM txns WHERE amount < 0').get().s || 0;
          }
        } catch {}
        const net = pos + neg; // neg is negative
        // Lottery
        let pool = 0; let share = null;
        try {
          const row = db.prepare('SELECT pool FROM lottery_state WHERE guild_id = ?').get(interaction.guildId);
          pool = row?.pool || 0;
          const { computePoolShare } = await import('../../utils/lottery.js');
          share = computePoolShare(interaction.guildId);
        } catch {}
        const lines = [
          `Users: **${totals.users || 0}**`,
          `Wallet: **${totals.wallet || 0}** • Bank: **${totals.bank || 0}**`,
          `GDP: **${gdp}**`,
          `Flow (${period}): +**${pos}** / **${neg}** → Net **${net}**`,
          `Lottery pool (this guild): **${pool}**${share!==null?` • Current pool share: **${Math.round(share*100)}%**`:''}`,
        ];
        return interaction.reply({ content: lines.join('\n') });
      }
    }
  }
}
