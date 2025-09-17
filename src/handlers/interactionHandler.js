import { createLogger } from '../utils/logger.js';
import aboutbot from '../commands/utilities/aboutbot.js';

const logger = createLogger('InteractionHandler');

export default async function handleInteraction(interaction, client, db) {
  try {
    if (interaction.isChatInputCommand()) {
      // ...existing command handling code...
    } 
    // Add button interaction handling
    else if (interaction.isButton()) {
      // Handle aboutbot buttons
      if (interaction.customId.startsWith('aboutbot_')) {
        await aboutbot.handleInteraction(interaction, client, db);
      }
      // Handle stream clip button
      else if (interaction.customId === 'clip_stream') {
        // Get streamHandler from client
        const streamHandler = client.streamHandler;
        if (streamHandler) {
          await streamHandler.createClip(interaction);
        } else {
          await interaction.reply({ 
            content: 'Stream functionality is not available right now.', 
            ephemeral: true 
          });
        }
      }
      // ...existing button handling code...
    } 
    // ...existing other interaction handling code...
  } catch (error) {
    logger.error('Error handling interaction', error);
    // ...existing error handling code...
  }
}