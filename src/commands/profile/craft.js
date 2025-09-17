import { SlashCommandBuilder } from 'discord.js';
import { listRecipes, craftMake } from '../../utils/crafting.js';
import { baseEmbed } from '../../utils/embeds.js';
import { EPHEMERAL } from '../../utils/flags.js';

export default {
  data: new SlashCommandBuilder()
    .setName('craft')
    .setDescription('Craft items from recipes')
    .addSubcommand(s => s.setName('recipes').setDescription('List available recipes'))
    .addSubcommand(s =>
      s.setName('make').setDescription('Craft a recipe')
        .addIntegerOption(o=> o.setName('id').setDescription('Recipe ID').setRequired(true))
        .addIntegerOption(o=> o.setName('qty').setDescription('Quantity').setRequired(false))
    ),
  async execute(interaction){
    const sub = interaction.options.getSubcommand();
    if (sub === 'recipes'){
      const rec = listRecipes();
      if (!rec.length) return interaction.reply('No recipes yet.');
      const lines = rec.map(r => `**#${r.id}** — ${r.name} • cost **${r.cost}**\nIn: ${r.inputs.map(i=>`${i.item}×${i.qty||1}`).join(', ')}\nOut: ${r.outputs.map(o=>`${o.item}×${o.qty||1}`).join(', ')}`);
      const e = baseEmbed({ title: '🛠️ Crafting Recipes', description: lines.join('\n\n'), color: 'info' });
      return interaction.reply({ embeds: [e] });
    }
    if (sub === 'make'){
      const id = interaction.options.getInteger('id', true);
      const qty = interaction.options.getInteger('qty') ?? 1;
      const res = craftMake(interaction.user.id, id, qty);
      if (!res.ok){
        const msg = {
          not_found: 'Recipe not found.',
          funds: 'Not enough coins.',
          materials: 'You do not have the required materials.',
        }[res.code] || 'Could not craft right now.';
        return interaction.reply({ content: msg, flags: EPHEMERAL });
      }
      return interaction.reply({ content: `Crafted **${res.recipe.name}** × ${qty} for **${res.totalCost}** coins.` });
    }
  }
}

