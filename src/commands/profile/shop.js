import { SlashCommandBuilder } from 'discord.js';
import { listItems, getItemById, purchaseItem, ensurePetItems } from '../../utils/shop.js';
import { grantAchievement } from '../../utils/achievements.js';
import { postAchievement } from '../../utils/achievements_feed.js';
import { baseEmbed } from '../../utils/embeds.js';
import { incQuest } from '../../utils/quests.js';
import { incBurstMetric } from '../../utils/events.js';

export default {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse and buy items')
    .addSubcommand(s =>
      s.setName('list').setDescription('List available items')
    )
    .addSubcommand(s =>
      s.setName('buy').setDescription('Buy an item by ID')
       .addIntegerOption(o => o.setName('id').setDescription('Item ID').setRequired(true))
       .addIntegerOption(o => o.setName('qty').setDescription('Quantity').setRequired(false))
    )
    .addSubcommand(s =>
      s.setName('info').setDescription('View item details')
       .addIntegerOption(o => o.setName('id').setDescription('Item ID').setRequired(true))
    ),
  async execute(interaction){
    try { ensurePetItems(); } catch {}
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const userId = interaction.user.id;

    if (sub === 'list') {
      const items = listItems();
      if (!items.length) return interaction.reply('The shop is empty.');
      const lines = items.map(i => `**#${i.id}** — ${i.name} — **${i.price}** coins${i.stock != null ? ` • stock: ${i.stock}` : ''}${i.role_id ? ' • grants role' : ''}`);
      const embed = baseEmbed({ title: `${interaction.guild.name} • Shop`, color: 'info' })
        .setDescription(lines.join('\n'));
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'info') {
      const id = interaction.options.getInteger('id', true);
      const item = getItemById(id);
      if (!item || !item.enabled) return interaction.reply('Item not found.');
      const embed = baseEmbed({ title: `Item #${item.id} — ${item.name}`, color: 'info' })
        .setDescription(item.description || 'No description')
        .addFields(
          { name: 'Price', value: `${item.price} coins`, inline: true },
          { name: 'Stock', value: item.stock == null ? 'Unlimited' : String(item.stock), inline: true },
          { name: 'Grants Role', value: item.role_id ? `<@&${item.role_id}>` : 'No', inline: true },
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'buy') {
      const id = interaction.options.getInteger('id', true);
      const qty = interaction.options.getInteger('qty') ?? 1;
      const result = purchaseItem(guild, userId, id, qty);
      if (!result.ok) {
        const code = result.code;
        const msg = {
          not_found: 'Item not found.',
          insufficient_funds: 'You do not have enough coins.',
          out_of_stock: 'That item is out of stock.',
        }[code] || 'Could not complete purchase.';
        return interaction.reply(msg);
      }

      // try granting role if any
      if (result.item.role_id) {
        try {
          const member = await guild.members.fetch(userId);
          const role = guild.roles.cache.get(result.item.role_id);
          if (member && role && member.manageable) {
            await member.roles.add(role).catch(()=>{});
          }
        } catch { /* ignore */ }
      }

      try {
        const granted = grantAchievement(interaction.guildId, userId, 'first_buy');
        if (granted) await postAchievement(interaction.guild, userId, 'first_buy');
      } catch {}
      try { incQuest(interaction.guildId, userId, 'daily_buy_item', 1); } catch {}
      try { incBurstMetric(interaction.guildId, userId, 'shop', result.qty); } catch {}
      return interaction.reply(`Purchased **${result.item.name}** × ${result.qty} for **${result.total}** coins.`);
    }
  }
}
