// src/utils/quests_ui.js
import { baseEmbed, COLORS } from './embeds.js';
import { getQuests, questMetaByKey } from './quests.js';

function bar(progress, target, len = 16){
  const pct = Math.max(0, Math.min(1, target ? progress/target : 0));
  const filled = Math.round(pct * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled) + ` ${Math.floor(pct*100)}%`;
}

export function buildQuestsEmbed(guildId, user){
  const { daily, weekly } = getQuests(guildId, user.id);
  const readyCount = daily.filter(q=> q.progress>=q.target && !q.claimed).length + weekly.filter(q=> q.progress>=q.target && !q.claimed).length;
  const title = readyCount ? `${user.username} • Quests (Ready: ${readyCount})` : `${user.username} • Quests`;
  const embed = baseEmbed({ title, color: readyCount ? 'success' : 'info' });
  if (daily.length) {
    embed.addFields({ name: 'Daily', value: daily.map(q => {
      const meta = questMetaByKey(q.quest_key);
      const title = meta?.name || q.quest_key;
      const desc = meta?.description ? ` — ${meta.description}` : '';
      const status = q.claimed? ' (claimed)' : (q.progress>=q.target? ' (ready)' : '');
      return `• ${title}${desc}\n  ${bar(q.progress, q.target)} ${q.progress}/${q.target}${status}`;
    }).join('\n') });
  }
  if (weekly.length) {
    embed.addFields({ name: 'Weekly', value: weekly.map(q => {
      const meta = questMetaByKey(q.quest_key);
      const title = meta?.name || q.quest_key;
      const desc = meta?.description ? ` — ${meta.description}` : '';
      const status = q.claimed? ' (claimed)' : (q.progress>=q.target? ' (ready)' : '');
      return `• ${title}${desc}\n  ${bar(q.progress, q.target)} ${q.progress}/${q.target}${status}`;
    }).join('\n') });
  }
  return embed;
}
