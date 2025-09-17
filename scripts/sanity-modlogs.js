// scripts/sanity-modlogs.js
// Offline sanity test: create a case, update reason, and print summary.
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';
import { createCase, getCase, updateCaseReason, buildCaseEmbed, setModlogChannelId } from '../src/utils/modlog.js';

await ensureDB();
const db = getDB();

const guildId = process.env.GUILD_ID || 'local-test-guild';
const guild = {
  id: guildId,
  // minimal shape to satisfy utils when not posting
  channels: { cache: new Map() },
};

// ensure a modlog channel id exists (won't be used to post in this offline test)
setModlogChannelId(guildId, process.env.MODLOG_TEST_CHANNEL || '0');

// Record current max case id
const before = db.prepare('SELECT MAX(case_id) AS max FROM mod_cases WHERE guild_id = ?').get(guildId)?.max || 0;

// Create a case
const created = createCase(guild, {
  action: 'kick',
  targetId: process.env.TEST_TARGET_ID || '111111111111111111',
  moderatorId: process.env.TEST_MOD_ID || '222222222222222222',
  reason: 'Initial sanity reason',
});

// Verify sequential id
if (created.case_id !== before + 1) {
  console.error('❌ Case ID not sequential:', { before, new: created.case_id });
  process.exit(1);
}

// Update reason
updateCaseReason(guildId, created.case_id, 'Updated reason OK');
const updated = getCase(guildId, created.case_id);

// Build embed summary (no network)
const embed = buildCaseEmbed({ ...updated });

console.log('✅ Sanity OK');
console.log('Case:', { guildId, caseId: created.case_id, action: created.action });
console.log('Embed title:', embed.data?.title || '(no title)');
console.log('Reason:', updated.reason);

