import { recordMessageActivity } from "../analytics/tracker.js";
import { scoreSentiment } from "../utils/sentiment.js";

export async function onMessageAnalytics(message) {
  if (message.author?.bot) return;
  if (!message.guild) return;

  try {
    const content = message.content ?? "";
    const wordCount = content ? content.trim().split(/\s+/).filter(Boolean).length : 0;
    const sentiment = scoreSentiment(content);

    recordMessageActivity({
      guildId: message.guildId,
      channelId: message.channelId ?? 'unknown',
      channelName: message.channel?.name ?? null,
      userId: message.author.id,
      messageId: message.id,
      createdAt: message.createdTimestamp ?? Date.now(),
      wordCount,
      isReply: Boolean(message.reference?.messageId),
      replyCount: message.reference?.messageId ? 1 : 0,
      mentionCount: message.mentions?.users?.size ?? 0,
      sentiment,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("message analytics tracking failed", error);
    }
  }
}

