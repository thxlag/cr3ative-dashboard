# Cr3ative BOT v5.0.2

Full-featured Discord economy and streaming assistant backed by SQLite (`better-sqlite3`) and powered by discord.js v14.

## Highlights
- Persistent economy with jobs, quests, streaks, achievements, shop items, crafting, titles, and pets.
- Casino suite (blackjack, roulette, slots, mines, crash, lottery, wagers) with configurable RTP and house edge controls.
- Moderation & admin tooling: `/ecoadmin` suite, modlogs with case tracking, audit-friendly leaderboards.
- Streaming pipeline for Twitch and YouTube: live alerts, clip creation, milestone celebrations, and subscriber role sync.
- Modular command registry with auto-deploy support, typed logging, and clear migration scripts for every subsystem.

## Getting Started
1. Install Node.js 20 or newer.
2. Copy the environment file: `cp .env.example .env` (or manual copy on Windows).
3. Fill at least `BOT_TOKEN`, `CLIENT_ID`, and optionally `GUILD_ID` for faster guild deployments.
4. Install dependencies: `npm install`.
5. Deploy slash commands: `npm run deploy`.
6. Start the bot: `npm run dev`.

By default the economy database lives at `data/economy.sqlite`. Override it with `DB_PATH` in `.env` if you want a custom location.

## Slash Commands by Category
- **Economy**: `/balance`, `/daily`, `/work`, `/deposit`, `/withdraw`, `/give`, `/leaderboard`
- **Jobs**: `/job list|info|apply|stats`, `/streak`, `/work` (job-aware payout and cooldowns)
- **Casino**: `/blackjack`, `/roulette`, `/slots`, `/coinflip`, `/mines`, `/crash`, `/lottery`, `/lottohistory`, `/wager`
- **Profile & Inventory**: `/profile`, `/inventory`, `/shop list|info|buy`, `/craft`, `/titles`, `/badges`, `/pet`
- **Quests & Achievements**: `/quests view|claim`, `/achievements`, `/questleaderboard`
- **Moderation & Admin**: `/ecoadmin add|remove|setwallet|setbank|resetdaily|bonus`, `/ban`, `/kick`, `/timeout`, `/modlog set|view|reason`
- **Utilities & Info**: `/ping`, `/aboutbot`, `/help`, `/helpadmin`, `/aboutbot` feedback buttons
- **Fun & Social**: `/8ball`, `/avatar`, `/meme`, `/pokemon catch|hint|stats`
- **Streaming**: `/stream status|clip|link`, `/streamrole join|leave`

## Key Systems
### Admin Permissions
Grant the `/ecoadmin` suite by setting `OWNER_ID` or supplying comma-separated role IDs via `ADMIN_ROLE_IDS`.

### Modlogs & Cases
- Configure once with `node scripts/migrate-modlogs.js`.
- `/modlog set #channel` to choose the target channel.
- `/ban`, `/kick`, and `/timeout` automatically create cases.

### Shop, Inventory, and Crafting
- Run `node scripts/migrate-shop.js` to create tables and seed starter items.
- Economy items support inventory counts, crafting recipes, and cosmetic titles/badges.

### Jobs & Streaks
- Bootstrap with `node scripts/migrate-jobs.js` and optional `node scripts/migrate-streaks.js` if migrating older data.
- Daily streaks, shift events, gear bonuses, and job promotions are configurable via environment variables.

### Quests & Achievements
- Daily/weekly quest rotation defaults to 2 daily and 1 weekly. Adjust with `QUESTS_DAILY_COUNT` and `QUESTS_WEEKLY_COUNT`.
- Leaderboards and achievement feeds can target custom channels via `ACHIEVEMENTS_CHANNEL_ID`.

### Casino Tuning
- `SLOTS_RTP`: default `0.96` (acceptable range `0.50` to `0.99`).
- `BJ_FEE_PCT`: default `0.01` (set to `0.00` to make blackjack more generous).
- Lottery profit shares feed the jackpot pool automatically.

## Streaming Toolkit
1. Run `node scripts/migrate-streaming.js` to create tables for links, clips, stats, events, and milestones.
2. Populate the following environment variables:
   - `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_CHANNEL`
   - `YT_API_KEY`, `YT_CHANNEL_ID`
   - `STREAM_NOTIFICATION_CHANNEL_ID`, `STREAM_ROLE_ID`
   - Optional subscriber roles: `TWITCH_SUB_ROLE_ID`, `YOUTUBE_MEMBER_ROLE_ID`
   - Optional tuning: `MILESTONE_ANNOUNCEMENTS_ENABLED`, `FOLLOWER_MILESTONE_INCREMENTS`, `SUBSCRIBER_MILESTONE_INCREMENTS`, `STREAM_THUMBNAIL_UPDATE_INTERVAL`
3. Deploy commands (`npm run deploy`) and start the bot.

Users can link their streaming accounts with `/stream link`, check live status with `/stream status`, and manage pings with `/streamrole join|leave`. Twitch clips are created directly from Discord with the `Create Clip` button and are logged in the `stream_clips` table.

## Chat Mini-Games
Keep conversations lively with quick-fire activities that drop into the flow of chat.
- Wild encounters: Pokemon-style spawns reward the fastest trainers. `/pokemon catch name:<guess>` grabs the active spawn, `/pokemon hint` provides clues, `/pokemon stats` tracks collections, and `/pokemon config` lets admins test different spawn settings.
- Lightweight socials: `/8ball`, `/avatar`, `/meme`, `/wager`, and scheduler-ready events give communities instant moments to react to.
- Tune spawn and pacing with `POKEMON_SPAWN_CHANCE`, `POKEMON_SPAWN_COOLDOWN_SECONDS`, `POKEMON_DESPAWN_SECONDS`, and future scheduler-driven specials.

## Auto Events & Engagement
The auto-events system reacts to server activity to trigger XP boosts, quest bursts, and other engagement perks. Configure it with:
- `EVENTS_ANNOUNCE_CHANNEL_ID`
- `EVENTS_MIN_ACTIVE_USERS`
- XP or quest tuning variables documented in `.env.example`

## Development Notes
- Dashboard API scaffold: `npm run dashboard` starts the local dashboard server on `DASHBOARD_PORT` (default 4000).
- Logs are colour-coded through `src/utils/logger.js` for quick scanning.
- Command loading lives in `src/utils/registry.js`, so dropping a new command file and restarting is enough for local testing.
- Use `npm run deploy` after adding or renaming commands to sync Discord's slash registry.

Happy building!




