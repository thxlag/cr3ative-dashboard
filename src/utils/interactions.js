export async function safeReply(interaction, payload){
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp(payload);
    }
    return await interaction.reply(payload);
  } catch (e) {
    // swallow ack errors (e.g., Unknown interaction)
    return null;
  }
}

