# KuttukTime Backend

REST API for **KuttukTime** — a Telegram Mini App for buying and gifting gift certificates from local businesses in Kyrgyzstan (coffee shops, restaurants, spas, gyms). No sign-up: the buyer logs in with Telegram, pays through Finik, gets an 8-digit code (and its QR) and gifts it to a friend in a chat; the venue's owner redeems it at the counter; the platform pays the venue 90% weekly.

- **Production:** `https://kuttuk-time.koyeb.app` (Koyeb, deploys **`dev`**)
- **Frontend:** `../frontend` (React, Telegram Mini App, deployed on Vercel)
- **Full context** — product decisions, every endpoint, the database, runbooks: [`CLAUDE.md`](CLAUDE.md). Task queue and current state: [`docs/workflow.md`](docs/workflow.md).

## Stack

NestJS 12 · TypeScript 6 · Express 5 · **Node 24** · PostgreSQL + TypeORM 0.3 (migrations) · Passport JWT (Telegram initData) · Finik (payments) · Telegram Bot API · Cloudinary (images) · Jest 30 + Testcontainers

## Local setup

```bash
npm install
cp .env.example .env        # fill it in — see below
npm run start:dev           # http://localhost:3000, Swagger at http://localhost:3000/api
```

Needs **Node 24** and a local **PostgreSQL**. For a quick local DB set `DB_SYNC=true` (TypeORM builds the schema from the entities); anything else runs the migrations on start — the way production does it.

**The app doesn't start without the `FINIK_*` variables.** Everything else degrades gracefully: without `BOT_TOKEN` log-in is refused (and bot messages aren't sent), without `MINI_APP_URL` the bot's per-chat menu button is skipped. The full list with notes is in `CLAUDE.md` → **ENV variables**.

## Scripts

| Command | What it does |
|---|---|
| `npm run start:dev` | dev server with watch |
| `npm run build` / `npm run start:prod` | production build / run it (the Dockerfile runs `node dist/main`) |
| `npm run typecheck` · `npm run lint` · `npm run format` | checks (lefthook runs typecheck + lint on pre-push) |
| `npm test` | unit tests (no DB) |
| `npm run test:int` | integration tests against a real Postgres 18 in Docker (Testcontainers) — **Docker must be running** |
| `npm run migration:generate -- src/database/migrations/<Name>` | generate a migration — **against `kuttuktime_prodshape`**, see `CLAUDE.md` → Migrations |
| `npm run migration:run` · `migration:revert` · `migration:show` | apply / revert / list migrations |
| `npm run report:payouts -- --week 2026-10-19` | weekly merchant payout report (read-only, CSV) |
| `npm run orders:resolve-review -- --order <uuid> --issue \| --refunded` | resolve a `needs_review` order by hand |
| `npm run bot:setup [-- --dry-run]` | one-time Telegram bot setup (webhook, descriptions, menu button) |
| `npm run finik:smoke` | create a real 1 KGS Finik payment and print its URL (manual) |

## API at a glance

Every route needs a JWT (`Authorization: Bearer …`) unless public. Details for each — `CLAUDE.md` → **API**.

- **Auth:** `POST /api/auth/log-in` (Telegram initData → JWT, 2 h)
- **Buyer:** `GET /api/venues`, `GET /api/venues/:idOrSlug`, `GET /api/venues/options`, `GET /api/categories`, `POST /api/orders`, `GET /api/orders/:id`, `GET /api/certificates/my`, `POST /api/certificates/:id/share`
- **Merchant cabinet** (`/api/merchants/me`): its venues, edit a venue, summary, certificates, look up / redeem a code
- **Admin** (`/api/admin/*`): merchants, venues, categories, payouts (report + mark paid), orders
- **Public:** `GET /:slug` (venue deep link), `GET /api/payments/return/:orderId`, `GET /api/qr/<code>.jpg`, webhooks `POST /api/finik/webhook` and `POST /api/telegram/webhook`

Roles: `user` (buyer), `merchant` (a venue owner — assigned at log-in when the Telegram id matches a merchant), `admin` (set by hand in the DB).

## Deployment

**Push to `dev` → Koyeb rebuilds and redeploys prod** (no PRs to `main`; Koyeb doesn't wait for CI, so run the tests before pushing). Pending migrations run on boot (`DB_SYNC=false`), each in its own transaction; a failing one stops the app from starting. **Take a `pg_dump` of prod before pushing a migration.** Environment variables live in the Koyeb dashboard and are never committed. CI (GitHub Actions): lint, typecheck, unit, integration, `npm audit`.
