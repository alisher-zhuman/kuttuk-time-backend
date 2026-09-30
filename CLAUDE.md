# KuttukTime Backend — Context for Claude

## Project

**KuttukTime** — a Telegram Mini App (TMA) for quickly buying and gifting gift certificates from local Kyrgyzstan businesses (coffee shops, spas, restaurants, beauty salons).

**Core idea:** the user buys a certificate and gifts it in 30 seconds. No sign-up, no phone number — everything runs through Telegram.

**Production:** `https://kuttuk-time.koyeb.app` (Koyeb, Frankfurt, Free tier)
**CI/CD:** push to `main` → automatic redeploy

---

## Business model

**10% commission** on every sale.

```
User pays:             1000 KGS
Payment provider:       -20 KGS (2%)
Merchant payout:       -900 KGS (90%)
Our net revenue:        +80 KGS (~8% net)
```

**Merchant payouts:** every Monday, automatically, via Finik / Bakai / Freedom.

**Forecast:**
| Period | Merchants | Orders/week | Revenue/month |
|--------|-----------|-------------|---------------|
| Month 1-2 | 2 | 20-50 | 2,000–3,000 KGS |
| Month 3-4 | 5-10 | 100-200 | 15,000–30,000 KGS |
| Month 6+ | 20-50 | 500+ | 75,000+ KGS |

**Worry threshold:** < 10 orders/week
**Success threshold:** > 50 orders/week after the first month

---

## User flow

```
1. Opened KuttukTime in Telegram
2. Picked a merchant (Coffee Ali, Spa Vishnya, Restaurant Maraba...)
3. Picked a denomination (500, 1000, 2000 KGS...)
4. Paid → got a code → shared it in Telegram
```

## Merchant flow

**Onboarding:** receives a special link → opens it in Telegram → the system remembers them as the owner.

**Redeeming a certificate:**
1. Customer arrives, shows the code (e.g. `KT-ALI-5847`)
2. Cashier opens the KuttukTime app
3. Taps "Mark as used" → the code moves to the used state
4. Customer receives the service ✅

---

## Stack

- **NestJS 10** + TypeScript + Express
- **PostgreSQL** via TypeORM 0.3
- **Passport JWT** — authentication via Telegram initData (HMAC-SHA256)
- **Cloudinary** — image storage (auto-converts to WebP)
- **Swagger** — auto-docs at `/api`
- **Throttler** — 60 requests / 60 sec globally

## Commands & conventions

- `npm run start:dev` — dev server with watch (`:3000`, Swagger at `/api`)
- `npm run build` / `npm run start:prod` — what the Dockerfile runs
- `npm run typecheck` · `npm run lint` · `npm run format` — lefthook runs typecheck + lint on **pre-push**
- `@/` path alias = `src/`
- **Every route requires a JWT** (global `JwtGuard` + `ThrottlerGuard` in `app.module.ts`); opt out with `@Public()`
- Admin endpoints live in separate `admin-*.controller.ts` files under `/api/admin/*`, class-level `@UseGuards(RolesGuard) @Roles("admin")`
- `ValidationPipe({ whitelist: true })` without `transform` — unknown body fields are silently stripped (not rejected); query/params stay strings, so use `ParseIntPipe` / `ParseBoolPipe`
- `GlobalExceptionFilter` turns Postgres unique violations into 409 (`<field> "<value>" is already in use`) and logs every 5xx with a stack trace

---

## Database (current entities)

**users** — `id`, `telegramId` (unique, **bigint** — Telegram IDs exceed int4), `role` (user/merchant/admin), `createdAt`

**merchants** — `id`, `name`, `description` (multilingual jsonb `{kg,ru,en}`), `categories[]`, `nominals[]`, `validityMonths` (default 12), `merchantTelegramId` (**bigint**), `logo` (Cloudinary URL), `slug` (unique), `isActive`, `createdAt`, `updatedAt`

**categories** — `id`, `name` (multilingual jsonb `{kg,ru,en}`), `order`

---

## Roles

| Role | Who | Permissions |
|------|-----|-------------|
| `user` | buyer | browse merchants, purchase |
| `merchant` | business owner | edit own profile, see own orders |
| `admin` | Alisher (system owner) | full access to everything |

**Auto-logic:** on login — if `telegramId` matches an active merchant, the role automatically becomes `merchant`.

**How the role is enforced:** the role is read from the DB at login time and baked into the JWT payload. `JwtStrategy` verifies the token signature (JWT_SECRET) on every request and puts `{ userId, role, telegramId }` on `request.user`; `RolesGuard` compares it against `@Roles(...)`. The role is a snapshot from login — changing it in the DB requires a fresh `log-in` to take effect. `admin` is only assigned manually via SQL (`UPDATE users SET role='admin' WHERE ...`).

`@Roles(...)` works on a class or a method (method overrides class); it needs `@UseGuards(RolesGuard)` alongside. `log-in` rejects initData older than 24h (`auth_date`) — deliberately not shorter, since Telegram doesn't refresh initData while the Mini App is open and the frontend re-logs-in with it on 401.

---

## API (already built)

**Public (no JWT):**
- `POST /api/auth/log-in` — login via Telegram initData → JWT (returns 200)
- `GET /:slug` — merchant redirect into the TMA (redirects to `telegram.me/kuttuk_time_bot/app?startapp=:slug`)

**Merchants — public surface (any authenticated role: user/merchant/admin), resolved shape:**
- `GET /api/merchants` — active only, filters `?search=`, `?category=` (id), language via `Accept-Language`
- `GET /api/merchants/:idOrSlug` — by ID or slug, active only (inactive → 404)

**Merchants — self-service (role: merchant):**
- `GET /api/merchants/me` — own full profile, looked up by `merchantTelegramId`
- `PATCH /api/merchants/me` — update own profile (no `isActive`/`slug`/`merchantTelegramId`); 403 if deactivated (`GET /me` still works and returns `isActive`)

**Merchants — admin (role: admin), raw shape, under `/api/admin/merchants`:**
- `GET /api/admin/merchants` — trimmed list (id/name/logo/isActive), filters `?search=`, `?category=`, `?isActive=`
- `GET /api/admin/merchants/:id` — full detail (minus `updatedAt`)
- `POST /api/admin/merchants` — create → 201
- `PATCH /api/admin/merchants/:id` — update any (incl. `isActive`, `slug`, `merchantTelegramId`)

**Categories — public (any authenticated role):**
- `GET /api/categories` — sorted by `order`, `name` resolved to one language via `Accept-Language`

**Categories — admin (role: admin), raw `{kg,ru,en}` shape, under `/api/admin/categories`:**
- `GET /api/admin/categories` — list
- `POST /api/admin/categories` — create → 201
- `PATCH /api/admin/categories/reorder` — reorder (body: full ordered array of ids)
- `PATCH /api/admin/categories/:id` — rename only
- `DELETE /api/admin/categories/:id` — delete, also strips the id from any merchant's `categories` → 204

**Upload (role: merchant or admin):**
- `POST /api/upload` — upload an image (multipart field `file`), max 5MB → 413 if larger, 400 if missing/not an image

---

## Project status — where we stopped

- **2026-07-02 → 07-14:** active development. Last feature: `GET /merchants/me` (07-10). PR #34 merged to `main` on 07-14 — **that's what prod runs**. Frontend's last commit before the break: 07-15 (merchant profile edit).
- **~2.5-month break.**
- **2026-09-30:** full review + fix pass on `dev` (RolesGuard ignored class-level `@Roles` → any user could reach `/api/admin/*`; JWT lived 7d instead of 2h; initData had no `auth_date` expiry; 5xx weren't logged; upload without file → 500; inactive merchants visible by id/slug; weak merchant DTO validation; old logo deleted before save). Frontend got a similar pass the same day.
- **Not yet on prod:** the 09-30 fixes stay on `dev` until merged to `main`. Local `main` can be stale — `git fetch` before comparing.
- **Next:** review backlog is done (throttler proxy-IP issue parked in TODOs) — start the MVP list below with the Orders module. Frontend is blocked on orders + payments (buy button is a TODO, certificates tab is mock data).

## What still needs building (MVP)

The main things not yet implemented:

1. **Orders module** — certificates: code generation (`KT-XXX-NNNN`), statuses (active/used/expired), links to merchant and buyer
2. **Payment integration** — Finik / Bakai / Freedom (buying a certificate)
3. **Merchant cabinet** — weekly stats, list of active codes, "mark as used"
4. **Weekly reports** — automatic calculation and merchant notification every Monday

---

## Testing

**Current state:** the tooling is set up (Jest, Supertest, ts-jest installed; `npm test`, `test:watch`, `test:cov`, `test:e2e` scripts present) but **no tests are written yet** — there are zero `.spec.ts` files.

**Plan:** tests come **after MVP** (deliberate — we ship the MVP first). When we do write them, start with the highest-value, riskiest logic:
1. **initData HMAC verification** (`auth.service`) — signing/verification is subtle and already bit us once (the `signature` field). Cover it with real fixtures.
2. **Order code generation & status transitions** — money-adjacent, must be correct.
3. **Payment webhooks** — once integrated.

Until then, verify changes by exercising the real flow, not by assuming.

**Local verification recipe (worked well):**
- `npm run typecheck` + `npx eslint <file>` + `npx prettier --write <file>` — same checks lefthook runs on pre-push
- Local Postgres is expected on `localhost:5432` (`pg_isready`); start the app with `npx nest start`, wait for `curl localhost:3000/api`, `pkill -f "nest start"` after
- Role/guard checks: sign a JWT with `JWT_SECRET` from `.env` via `new (require('@nestjs/jwt').JwtService)({secret}).sign({userId, role, telegramId})` — no Telegram needed
- Login checks: build initData in node (sorted `k=v` lines, HMAC key = `HMAC("WebAppData", BOT_TOKEN)`) and POST to `/api/auth/log-in`; delete the test user afterwards (`DELETE FROM users WHERE "telegramId"=...`)
- Prod rate-limit state is visible in `X-RateLimit-Remaining` response headers — probe with a few requests only (shared bucket, see TODOs)

---

## Bot — messages and commands (future ideas)

Since there's no sign-up, the bot chat is effectively the user's only "account". Organized by roadmap phase.

**Important finding (verified by hand):** simply opening the TMA via a deep link and browsing does NOT create a persistent bot chat, even after passing Telegram's native ToS screen. The bot sticks in the user's chats only if write access is actually granted. Without it, once the TMA is closed the bot vanishes without a trace — no channel to that user remains.

**Now (2 merchants in testing):**
- The certificate code is duplicated as a bot message right after purchase (needs `requestWriteAccess` on the frontend — request it contextually, at the moment of purchase, NOT on first app open). This isn't just a "handy code backup" — it's the only moment a communication channel with the user appears at all. If they decline here too, the bot stays ephemeral for them — and that's fine, it means they didn't buy anything and there's nothing to message them about.
- Instant merchant notification of a new sale ("🎉 Sold: Sierra Coffee, 1000 KGS") — cheap to build, strongly boosts merchant trust during the worry threshold (< 10 orders/week).

**Soon (5–10 merchants, 100+ orders/week):**
- Reminder about an expiring certificate (N days before `validityMonths` ends)
- Weekly digest to the merchant on Mondays, in sync with the payout (see Weekly reports above)
- `/my_certificates` — shortcut command to show purchased codes without opening the mini app

**Later (20–50+ merchants, scale):**
- Inline mode (`@bot Sierra Coffee 500` in any chat → certificate card) — a strong viral mechanic for the gifting scenario; worth considering earlier than "later" if there's bandwidth
- Bot as a support channel (user/merchant messages forwarded to an admin chat)
- Bot commands for the internal team — fast merchant onboarding without a full admin panel

**Important:** do NOT send messages on "authenticated" / "just reopened the app" events — these happen too often and carry no content; risk that the user mutes the bot and loses access to genuinely important messages (code, expiry). Only trigger on events with concrete value to the recipient.

---

## Design

UI is finalized: purple `#8B5CF6` / pink `#EC4899`, light/dark themes.

---

## Platforms

| Layer | Role |
|-------|------|
| Telegram Mini App | Primary product, conversion |
| Website | SEO + trust + storefront (long-term) |
| Instagram/TikTok | Acquisition via merchant links |

**Personal merchant links (future):**
```
telegram.me/bot/app?startapp=coffeehouse_ali
yourapp.com/m/coffeehouse?ref=insta_ali
```

---

## Risks

| Risk | Mitigation |
|------|------------|
| Payment provider down | 3 providers: Finik, Bakai, Freedom |
| Merchants object to 10% | Can drop to 7-8% if needed |
| Customer disputes a purchase | Handle manually at the start |
| Competition (Giftery) | More local, faster, on Telegram |

---

## Working with Claude — rules

- **Alisher = frontend dev (React/TS)** — explain backend in simple terms
- One module at a time — next step only after an explicit "go"
- Explanation first (in Russian), then code
- Tests and detailed Swagger — after MVP
- No unnecessary abstraction — write the minimum needed
- **Proactively watch correctness across the whole project** — status codes, types, validation, error handling, edge cases, security, cross-module consistency — and fix issues as part of the work, not only the literal ask

---

## ENV variables

### Dev (`.env`)

| Variable | Example | Note |
|---|---|---|
| `DATABASE_HOST` | `localhost` | |
| `DATABASE_PORT` | `5432` | |
| `DATABASE_USER` | `postgres` | |
| `DATABASE_PASSWORD` | `postgres` | |
| `DATABASE_NAME` | `kuttuktime` | |
| `DATABASE_SSL` | `false` | `true` on Koyeb |
| `DB_SYNC` | `true` | **dev only**, `false` in prod |
| `JWT_SECRET` | `...` | long random string |
| `JWT_EXPIRATION` | `2h` | short-lived — token isn't persisted on the frontend (in-memory only), it silently re-logs-in via Telegram initData on 401, so a long TTL only adds risk without any UX benefit |
| `BOT_TOKEN` | `...` | from @BotFather, for initData verification |
| `CLOUDINARY_CLOUD_NAME` | `...` | |
| `CLOUDINARY_API_KEY` | `...` | |
| `CLOUDINARY_API_SECRET` | `...` | |
| `PORT` | `3000` | `8000` on Koyeb |
| `NODE_ENV` | `development` | `production` in prod |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | add the vercel URL in prod |

### Prod (Koyeb) — current list

| Variable | Note |
|---|---|
| `DATABASE_HOST` | Koyeb Postgres endpoint |
| `DATABASE_PORT` | `5432` |
| `DATABASE_USER` | |
| `DATABASE_PASSWORD` | |
| `DATABASE_NAME` | |
| `DATABASE_SSL` | `true` |
| `DB_SYNC` | `false` |
| `JWT_SECRET` | |
| `JWT_EXPIRATION` | `2h` |
| `BOT_TOKEN` | |
| `CLOUDINARY_CLOUD_NAME` | |
| `CLOUDINARY_API_KEY` | |
| `CLOUDINARY_API_SECRET` | |
| `PORT` | `8000` |
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGINS` | `http://localhost:5173,https://kuttuk-time.vercel.app` |

> `TG_BOT_USERNAME` and `TG_APP_NAME` were removed — the URL is hardcoded in the slug-redirect middleware in `src/main.ts`

---

## Known gaps (not urgent)

- **Orphaned Cloudinary uploads:** `POST /upload` doesn't track files in the DB — if a photo is uploaded but never attached to a merchant (form abandoned, save failed, replaced before saving), it stays in Cloudinary forever, nothing cleans it up. Not worth fixing at current scale (storage is cheap, ~8 merchants). If it becomes an issue: a daily cron job comparing Cloudinary's `kuttuk-time/` folder against all `merchant.logo` URLs currently in use, deleting anything unreferenced.

---

## Important TODOs before prod

- [ ] Enable `origin: allowedOrigins` in CORS (currently `origin: true`)
- [ ] **Throttler keys on the Koyeb proxy IP, not the client.** No `trust proxy` is set, so `req.ip` is the proxy hop, and every user behind the same proxy node shares one 60 req/min bucket. Verified on prod (2026-09-30): repeated requests from one client got `X-RateLimit-Remaining` 59→59→58→58→59, i.e. different proxy nodes, not one counter per client. Harmless at current traffic, but it will cause false 429s as traffic grows. Chain is client → Cloudflare → Koyeb → app. **Don't** just set `trust proxy: true`: Express would take the leftmost `X-Forwarded-For`, which the client controls, so anyone could bypass the limit by spoofing it. Plan: temporarily log `cf-connecting-ip`, `x-forwarded-for`, `x-real-ip` and `req.ip` on prod, check Koyeb logs to see which header carries the real client IP and can't be spoofed (most likely `CF-Connecting-IP`), then override the throttler tracker (`getTracker`) to use it, and remove the log. Note: the official NestJS docs example (`req.ips[0]` + `trust proxy`) has the same spoofing problem — don't copy it as-is.
- [ ] Add payments (Finik/Bakai/Freedom)
- [ ] When `DB_SYNC=false` on prod, apply schema changes manually. Pending: `ALTER TABLE users ALTER COLUMN "telegramId" TYPE bigint;` and `ALTER TABLE merchants ALTER COLUMN "merchantTelegramId" TYPE bigint;`
