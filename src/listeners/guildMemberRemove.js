export default {
  name: 'guildMemberRemove',
  async execute(member, client) {
    try {
      // Record analytics
      // You can uncomment this when tracker.js is working
      /*
      const { recordMemberEvent } = await import('../analytics/tracker.js');
      await recordMemberEvent(member, 'leave');
      */
      
      // Other leave logic can go here
    } catch (error) {
      console.error('Error handling member leave:', error);
    }
  }
};
