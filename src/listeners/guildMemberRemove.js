import { recordMemberEvent } from "../analytics/tracker.js";

export async function onGuildMemberRemove(member) {
  try {
    recordMemberEvent({
      guildId: member.guild?.id ?? null,
      userId: member.id,
      eventType: 'leave',
      eventAt: Date.now(),
      metadata: JSON.stringify({ joinedAt: member.joinedTimestamp ?? null }),
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn('member leave analytics failed', error);
    }
  }
}
