import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('ping').setDescription('Pong!'),
  async execute(interaction){
    const msg = await interaction.reply({ content: 'Pinging...' , fetchReply: true });
    const latency = msg.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`Pong! Roundtrip ${latency}ms`);
  }
}
