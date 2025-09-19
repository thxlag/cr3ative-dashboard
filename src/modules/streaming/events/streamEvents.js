import { log } from '../../../utils/logger.js';

export default {
  name: 'interactionCreate',
  once: false,

  async execute(interaction, client, db, streamHandler) {
    try {
      // Handle button interactions for stream-related buttons
      if (interaction.isButton()) {
        if (interaction.customId === 'clip_stream') {
          if (!streamHandler) {
            await interaction.reply({ content: 'Stream features are not ready yet.', ephemeral: true });
            return;
          }
          await streamHandler.createClip(interaction);
        }
      }
    } catch (err) {
      log.error('Error in streamEvents.execute', err);
      // If interaction hasn't been replied to, try to inform user
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'An error occurred handling the stream interaction.', ephemeral: true });
        }
      } catch (e) {
        // ignore
      }
    }
  }
};
