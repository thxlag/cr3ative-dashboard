import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getLotteryState, setLotteryRole, startLottery, enterLottery, endLottery, isLotteryActive, addToLotteryPool } from '../../utils/lottery.js';
import { safeReply } from '../../utils/interactions.js';
import { baseEmbed } from '../../utils/embeds.js';
import { decWallet } from '../../lib/econ.js';
import { getDB } from '../../lib/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('lottery')
    .setDescription('Community lottery powered by casino profits')
    .addSubcommand(s => s.setName('info').setDescription('Show current jackpot and settings'))
    .addSubcommand(s =>
      s.setName('setrole').setDescription('Admin: set role to ping on start')
        .addRoleOption(o => o.setName('role').setDescription('Role to ping').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('start').setDescription('Admin: start a lottery and ping the role (uses default lottery channel unless overridden)')
        .addChannelOption(o => o.setName('channel').setDescription('Override channel').setRequired(false))
        .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes (default env)').setRequired(false))
    )
    .addSubcommand(s =>
      s.setName('enter').setDescription('Enter the active lottery (once per use, stacks)')
        .addIntegerOption(o => o.setName('tickets').setDescription('How many tickets (default 1)').setRequired(false))
        .addIntegerOption(o => o.setName('spend').setDescription('Or spend this many coins on tickets').setRequired(false))
    )
    .addSubcommand(s => s.setName('end').setDescription('Admin: draw a winner now')),
  execute(interaction){
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (sub === 'info'){
      const st = getLotteryState(guild.id);
      const db = getDB();
      const active = db.prepare('SELECT channel_id, end_at FROM lottery_active WHERE guild_id = ?').get(guild.id) || { channel_id: null, end_at: null };
      const effectiveChannel = active.channel_id || process.env.LOTTERY_CHANNEL_ID || null;
      const lines = [
        `Jackpot: **${st.pool}** coins`,
        effectiveChannel ? `Channel: <#${effectiveChannel}>` : 'Channel: (not set)',
        (st.role_id || process.env.LOTTERY_PING_ROLE_ID) ? `Ping role: <@&${st.role_id || process.env.LOTTERY_PING_ROLE_ID}>` : 'Ping role: (not set)',
        `Ticket price: **${Math.max(1, Math.floor(Number(process.env.LOTTERY_TICKET_PRICE || 50)))}**`
      ];
      if (active.end_at) lines.push(`Ends: <t:${Math.floor(active.end_at/1000)}:R>`);
      if (st.last_winner_user_id) lines.push(`Last: <@${st.last_winner_user_id}> won **${st.last_win_amount}**`);
      const embed = baseEmbed({ title: '🎟️ Lottery — Info', description: lines.join('\n'), color: 'info' });
      safeReply(interaction, { embeds: [embed] });
      return;
    }

    if (sub === 'setrole'){
      const isAdmin = !!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);
      if (!isAdmin) { safeReply(interaction, { content: 'You do not have permission to use this.', flags: 64 }); return; }
      const role = interaction.options.getRole('role');
      setLotteryRole(guild.id, role.id);
      safeReply(interaction, { content: `Set lottery ping role to ${role}.` });
      return;
    }

    if (sub === 'start'){
      const isAdmin = !!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);
      if (!isAdmin) { safeReply(interaction, { content: 'You do not have permission to use this.', flags: 64 }); return; }
      const ch = interaction.options.getChannel('channel');
      const defaultChannelId = process.env.LOTTERY_CHANNEL_ID || null;
      const useChannelId = (ch && ch.id) || defaultChannelId || interaction.channelId;
      const duration = interaction.options.getInteger('duration');
      const res = startLottery(guild, { channelId: useChannelId, startedBy: interaction.user.id, durationMin: duration });
      if (!res.ok) { safeReply(interaction, { content: 'A lottery is already active.', flags: 64 }); return; }
      const minutes = Number(duration || process.env.LOTTERY_DURATION_MIN || 60);
      safeReply(interaction, { content: `Lottery started for **${minutes}** minutes. Good luck!` });
      return;
    }

    if (sub === 'enter'){
      if (!isLotteryActive(guild.id)) { safeReply(interaction, { content: 'No active lottery right now.', flags: 64 }); return; }
      const price = Math.max(1, Math.floor(Number(process.env.LOTTERY_TICKET_PRICE || 50)));
      const spend = interaction.options.getInteger('spend');
      let tickets = Math.max(1, Math.floor(interaction.options.getInteger('tickets') || 0));
      if (spend && spend > 0) tickets = Math.floor(Number(spend) / price);
      if (!tickets || tickets < 1) { safeReply(interaction, { content: `That’s not enough for a ticket. Price per ticket: **${price}**.`, flags: 64 }); return; }
      const cost = tickets * price;
      const ok = decWallet(interaction.user.id, cost, 'lottery_tickets');
      if (!ok) { safeReply(interaction, { content: `You need **${cost}** coins for **${tickets}** ticket(s).`, flags: 64 }); return; }
      const res = enterLottery(guild.id, interaction.user.id, tickets);
      if (!res.ok) { safeReply(interaction, { content: 'No active lottery right now.', flags: 64 }); return; }
      try { addToLotteryPool(guild.id, cost); } catch {}
      safeReply(interaction, { content: `Entered with **${tickets}** ticket(s) for **${cost}** coins (price **${price}**/ticket).` });
      return;
    }

    if (sub === 'end'){
      const isAdmin = !!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);
      if (!isAdmin) { safeReply(interaction, { content: 'You do not have permission to use this.', flags: 64 }); return; }
      const res = endLottery(guild);
      if (res.winner) safeReply(interaction, { content: `🎉 Winner: <@${res.winner}> — **${res.amount}** coins!` });
      else safeReply(interaction, { content: 'No entries or no jackpot. Carrying over the pool.' });
      return;
    }
  }
}
