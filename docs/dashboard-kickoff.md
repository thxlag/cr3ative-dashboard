# Dashboard Revamp Kickoff

## Scope & Milestones

### Tier 1 (MVP)
- Discord OAuth2 with PKCE, refresh token support, secure session storage.
- Guild picker listing manage-permitted servers, search + filter.
- Live bot connection status (global + per guild) sourced via WebSocket heartbeat.
- General settings CRUD: prefix/slash toggle, welcome/leave messages (templated variables), role permissions matrix, module toggles.
- Command management UI: per-command enable/disable, category grouping, bulk actions.
- Moderation log viewer: table with filters (action, moderator, user, timeframe), detail drawer.
- Stats panels: total servers/users, latency, top commands; server view with member count, active voice channels, message velocity.
- SPA shell with responsive dark UI, nav, session handling, notifications.
- Real-time updates via WebSockets + optimistic UI for mutations.

### Tier 2 (Post-MVP)
- Automation rule builder (trigger/condition/action chains).
- Embed & component designer with live preview + templates.
- Advanced analytics: retention, channel heatmap, moderator workload.
- Export/API tokens, audit logging, alerts.

### Tier 3 (Stretch)
- Plugin marketplace, sentiment analysis, economy/leaderboards, integration hub, theming + localization.

## Implementation Roadmap

1. **Planning & UX**
   - Validate Tier 1 requirements with stakeholders.
   - Produce low-fi wireframes for global dashboard, guild view, mod logs, settings.
   - Define design tokens (colors, typography, spacing) to match Discord aesthetic.

2. **Repo Setup**
   - Introduce Vite + React 18 + TypeScript in `src/web/app`.
   - Configure ESLint (React + TS), Prettier, Husky + lint-staged.
   - Add Tailwind CSS + Radix primitives for accessible components.

3. **Auth & Session Layer**
   - Switch OAuth flow to PKCE; update `/auth/login` + `/auth/callback` routes.
   - Store tokens in server session; implement refresh endpoint + middleware.
   - Harden cookie settings (secure flag, sameSite=lax/strict based on env).

4. **API & Data Contracts**
   - Define REST endpoints for settings, commands, guild data (OpenAPI spec).
   - Expose WebSocket payload schema for live stats.

5. **Frontend Foundations**
   - Implement SPA shell (layout, navigation, auth guard).
   - Integrate TanStack Query for data fetching/cache.
   - Build reusable components: cards, tables, forms, modals, charts (e.g., Recharts/Chart.js).

6. **Feature Implementation**
   - Guild picker + session context.
   - General settings forms with validation (Zod + React Hook Form).
   - Command management grid with optimistic toggle.
   - Moderation log table + filters + details.
   - Stats dashboards with live updates.

7. **Data Pipeline Prep**
   - Confirm persistence layer (Postgres + Prisma, Redis cache).
   - Define schemas + migrations for moderation logs, command usage, stats.
   - Build worker skeleton for ingesting bot events.

8. **Testing & QA**
   - Unit tests (Jest/React Testing Library) for components + hooks.
   - Integration tests for API routes (Vitest/Supertest).
   - End-to-end flow with Playwright (login ? guild select ? settings change).

9. **Deployment**
   - Containerize dashboard server + SPA (Docker). 
   - Set up CI/CD (GitHub Actions) for lint/test/build.
   - Provision staging environment.

## Immediate Action Items
- [ ] Approve roadmap & Tier 1 scope.
- [ ] Draft wireframes (Figma or Excalidraw) for shell + key panels.
- [ ] Add Vite/React/TS tooling to repo and scaffold SPA entry point.
- [ ] Document API contracts (OpenAPI stub) for frontend/back-end sync.
- [ ] Align on database choice (Postgres + Prisma recommended) and provisioning plan.

## Custom Domain Considerations
- **Development**: stick with `localhost` (update Discord redirect URIs accordingly).
- **Staging/Production**: yes, use a custom domain (e.g., `dashboard.cr3ativebot.com`). Benefits include trusted OAuth redirect URI, easier HTTPS via Let's Encrypt, branding.
- Requirements:
  - Purchase/register domain and manage DNS (Cloudflare recommended for proxy + WAF).
  - Configure Discord OAuth redirect URIs for `https://dashboard.cr3ativebot.com/auth/callback` (and staging variant). 
  - Obtain TLS certificates (auto via Cloudflare/ACME or managed load balancer).
  - Decide hosting: VPS (Docker), managed platform (Render, Fly.io), or Kubernetes cluster.
  - Plan for environment separation (dev/staging/prod) with distinct client IDs/secrets and redirect URIs.

## Open Questions
- Final decision on DB stack (existing SQLite vs. Postgres migration roadmap?).
- Expected concurrency/scale to size WebSocket infra.
- Preference for charting library and design system libraries.
- Any enterprise-grade compliance/security requirements?


## Development Commands
- `npm run dashboard`: starts the Express API + session server (port 4003 by default).
- `npm run dashboard:dev`: boots the Vite dev server at http://localhost:5173 with proxying to 4003.
- `npm run dashboard:build`: compiles the SPA into `src/web/app/dist`.
- `npm run dashboard:preview`: serves the built bundle for smoke-testing.

### After Building
Running `npm run dashboard` after a build automatically serves files from `src/web/app/dist`; otherwise it falls back to the static HTML in `src/web/public`.

## Next Implementation Focus
- Wire React views to real data sources: guild list endpoint, `/api/admin/stats`, moderation logs, command toggles, settings forms.
- Connect WebSocket `/ws` feed to hydrate live stats and status indicators instead of the health poll placeholder.
- Flesh out form validation with Zod + React Hook Form and persist to the dashboard settings endpoints.
- Introduce state slices (Zustand) for selected guild and feature flags.
- Layer in Tailwind design tokens/components for charts, tables, and automation builder once data contracts are finalized.
## Design Overhaul Roadmap (in progress)
- [ ] Flesh out component library in `src/web/app/src/ui` with Storybook demos, accessibility tests, and usage docs.
- [ ] Replace legacy panels with new primitives (`Card`, `StatTile`, `SectionHeading`) and add loading skeletons.
- [ ] Implement command palette, notification center, and contextual help overlays.
- [ ] Introduce charting layer (Recharts/ECharts) and responsive data visualization wrappers.
- [ ] Add onboarding walkthrough + saved view presets for admins.

## Custom Domain Checklist (Production)
1. **Domain & DNS**
   - Register domain/subdomain (e.g., `dashboard.cr3ativebot.com`).
   - Point DNS (A/AAAA or CNAME) to hosting provider; Cloudflare recommended for caching/WAF.
2. **TLS / HTTPS**
   - Issue TLS certificate (Let’s Encrypt via reverse proxy, Cloudflare proxy, or managed load balancer).
   - Ensure server trusts certificates and redirects HTTP?HTTPS.
3. **Discord OAuth Configuration**
   - Add `https://dashboard.cr3ativebot.com/auth/callback` (and staging equivalents) to the app’s OAuth2 Redirects list.
   - Create separate Discord applications/credentials per environment if needed.
4. **Environment Variables**
   - Set `DASHBOARD_REDIRECT_URI`, `DASHBOARD_CLIENT_ID`, `DASHBOARD_CLIENT_SECRET`, and `DASHBOARD_SESSION_SECRET` for production.
   - Configure session cookies with `secure: true` and `sameSite: 'lax'` behind HTTPS.
5. **Hosting & Deployment**
   - Containerize the dashboard (`Dockerfile`) or deploy via platform (Render, Fly.io, Hetzner, etc.).
   - Ensure WebSocket `/ws` endpoint is proxied correctly through load balancers/NGINX.
   - Configure CI/CD to run `npm run dashboard:build` and restart the service on deploy.
6. **Monitoring & Backups**
   - Enable logging/metrics (e.g., Loki + Grafana, Datadog, or CloudWatch).
   - Snapshot the SQLite database or migrate to Postgres for durability.
7. **Security Hardening**
   - Enforce HTTPS/HSTS, rate limit sensitive endpoints, rotate OAuth secrets regularly.
   - Set up alerting for auth failures and unexpected error spikes.
