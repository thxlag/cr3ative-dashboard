import { SlashCommandBuilder } from 'discord.js';
import { adoptPet, getPet, feedPet, playPet, trainPet } from '../../utils/pets.js';
import { EPHEMERAL } from '../../utils/flags.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Adopt and care for your pet')
    .addSubcommand(s => s.setName('adopt').setDescription('Adopt a pet').addStringOption(o=> o.setName('type').setDescription('Type').addChoices(
      { name: 'Dog', value: 'dog' }, { name: 'Cat', value: 'cat' }, { name: 'Fox', value: 'fox' }
    )))
    .addSubcommand(s => s.setName('info').setDescription('Show your pet'))
    .addSubcommand(s => s.setName('feed').setDescription('Feed your pet'))
    .addSubcommand(s => s.setName('play').setDescription('Play with your pet'))
    .addSubcommand(s => s.setName('train').setDescription('Train your pet')),
  async execute(interaction){
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    if (sub === 'adopt'){
      const type = interaction.options.getString('type') || 'dog';
      const res = adoptPet(userId, type);
      if (!res.ok){
        if (res.code === 'exists') return interaction.reply({ content: 'You already have a pet.', flags: EPHEMERAL });
        return interaction.reply({ content: 'Could not adopt now.', flags: EPHEMERAL });
      }
      return interaction.reply({ content: `You adopted a **${type}**!` });
    }
    if (sub === 'info'){
      const p = getPet(userId);
      if (!p) return interaction.reply({ content: 'You do not have a pet. Use /pet adopt.', flags: EPHEMERAL });
      const lines = [
        `Type: **${p.pet_type}** • Level: **${p.level}** (XP ${p.exp}/${p.level*100})`,
        `Mood: **${p.mood}** • Energy: **${p.energy}**`,
      ];
      return interaction.reply({ content: lines.join('\n') });
    }
    if (sub === 'feed'){
      const res = feedPet(userId);
      if (!res.ok){
        if (res.code === 'no_pet') return interaction.reply({ content: 'You do not have a pet. Use /pet adopt.', flags: EPHEMERAL });
        if (res.code === 'cooldown'){ const s = Math.ceil(res.remaining/1000); return interaction.reply({ content: `You can feed again in **${s}s**.`, flags: EPHEMERAL }); }
        return interaction.reply({ content: 'Could not feed now.', flags: EPHEMERAL });
      }
      return interaction.reply({ content: `You fed your pet. Energy is now **${res.energy}**.` });
    }
    if (sub === 'play'){
      const res = playPet(userId);
      if (!res.ok){
        if (res.code === 'no_pet') return interaction.reply({ content: 'You do not have a pet. Use /pet adopt.', flags: EPHEMERAL });
        if (res.code === 'cooldown'){ const s = Math.ceil(res.remaining/1000); return interaction.reply({ content: `You can play again in **${s}s**.`, flags: EPHEMERAL }); }
        return interaction.reply({ content: 'Could not play now.', flags: EPHEMERAL });
      }
      return interaction.reply({ content: `You played with your pet. Mood is now **${res.mood}**.` });
    }
    if (sub === 'train'){
      const res = trainPet(userId);
      if (!res.ok){
        if (res.code === 'no_pet') return interaction.reply({ content: 'You do not have a pet. Use /pet adopt.', flags: EPHEMERAL });
        if (res.code === 'cooldown'){ const s = Math.ceil(res.remaining/1000); return interaction.reply({ content: `You can train again in **${s}s**.`, flags: EPHEMERAL }); }
        if (res.code === 'tired') return interaction.reply({ content: 'Your pet is too tired. Feed them first.', flags: EPHEMERAL });
        return interaction.reply({ content: 'Could not train now.', flags: EPHEMERAL });
      }
      const msg = res.leveled ? `Level up! Your pet is now **Level ${res.level}**.` : `XP: ${res.exp}/${res.level*100}`;
      return interaction.reply({ content: `You trained your pet. ${msg}` });
    }
  }
}

