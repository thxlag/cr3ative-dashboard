// src/listeners/messageCreate.js
import { grantMessageXp, xpPerMessage, levelFromTotalXp } from '../utils/leveling.js';
import { handleLevelUpPing } from '../utils/level_pings.js';
import { getActiveEvent, recordEventScore, recordChatActivity } from '../utils/events.js';
import { applyLevelRewards } from '../utils/level_rewards.js';
import { incQuest, questMetaByKey } from '../utils/quests.js';
import { incBurstMetric } from '../utils/events.js';
import { grantAchievement } from '../utils/achievements.js';
import { handlePokemonMessage } from '../modules/pokemon/service.js';
import { postAchievement } from '../utils/achievements_feed.js';

const MAX_MULT = 3.0;

export async function onMessageCreate(message) {
  // ignore bots & DMs
  if (message.author?.bot) return;
  if (!message.guild) return;

  // tiny anti-spam: if content is present (and readable), require minimal length
  // do not block when Message Content intent is disabled (content would be empty)
  if (message.content && message.content.trim().length < 4 && (message.attachments?.size || 0) === 0) return;

  const base = xpPerMessage();

  // event multiplier (if any)
  let mult = 1.0;
  const active = getActiveEvent(message.guild.id);
  if (active) mult = Math.max(1.0, Math.min(Number(active.multiplier) || 1.0, MAX_MULT));

  const effective = Math.max(1, Math.floor(base * mult));

  const cooldownSec = Number(process.env.XP_COOLDOWN_SECONDS || 60);
  const res = grantMessageXp(message.guild.id, message.author.id, effective, cooldownSec * 1000);
  try { recordChatActivity(message.guild.id, message.author.id); } catch {}

  if (res.granted) {
    // quest progress
    try {
      const rA = incQuest(message.guild.id, message.author.id, 'daily_msgs', 1);
      const rB = incQuest(message.guild.id, message.author.id, 'weekly_xp', effective);
      if (rA.completedNow) {
        const meta = questMetaByKey('daily_msgs');
        message.author.send({ content: `Quest ready: **${meta?.name || 'daily_msgs'}** ?? use /quests claim.` }).catch(()=>{});
      }
    } catch {}
    // burst metric
    try { incBurstMetric(message.guild.id, message.author.id, 'msgs', 1); } catch {}
    // score the event using effective XP
    if (active) recordEventScore(message.guild.id, active.event_name, message.author.id, effective);

    // level-up handling
    if (res.newLevel > res.prevLevel) {
      const state = levelFromTotalXp(res.totalXp);
      handleLevelUpPing(message, state.level);
      // role rewards (best effort)
      applyLevelRewards(message.guild, message.member, state.level);
      // achievement: reach level 5
      if (state.level >= 5) {
        try {
          const granted = grantAchievement(message.guild.id, message.author.id, 'level_5');
          if (granted) await postAchievement(message.guild, message.author.id, 'level_5');
        } catch {}
      }
      // daily quest: level up once
      try { incQuest(message.guild.id, message.author.id, 'daily_level_up', 1); } catch {}
    }
  }
  try {
    await handlePokemonMessage(message);
  } catch (error) {
    console.error('pokemon spawn handling failed', error);
  }
}
