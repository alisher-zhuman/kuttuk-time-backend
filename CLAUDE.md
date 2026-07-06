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

---

## Database (current entities)

**users** — `id`, `telegramId` (unique, **bigint** — Telegram IDs exceed int4), `role` (user/merchant/admin), `createdAt`

**merchants** — `id`, `name`, `description` (multilingual jsonb `{kg,ru,en}`), `categories[]`, `nominals[]`, `validityMonths` (default 12), `merchantTelegramId` (**bigint**), `logo` (Cloudinary URL), `slug` (unique), `isActive`, `createdAt`, `updatedAt`

**categories** — `id`, `name` (unique), `order`

---

## Roles

| Role | Who | Permissions |
|------|-----|-------------|
| `user` | buyer | browse merchants, purchase |
| `merchant` | business owner | edit own profile, see own orders |
| `admin` | Alisher (system owner) | full access to everything |

**Auto-logic:** on login — if `telegramId` matches an active merchant, the role automatically becomes `merchant`.

**How the role is enforced:** the role is read from the DB at login time and baked into the JWT payload. `JwtStrategy` verifies the token signature (JWT_SECRET) on every request and puts `{ userId, role, telegramId }` on `request.user`; `RolesGuard` compares it against `@Roles(...)`. The role is a snapshot from login — changing it in the DB requires a fresh `log-in` to take effect. `admin` is only assigned manually via SQL (`UPDATE users SET role='admin' WHERE ...`).

---

## API (already built)

**Public (no JWT):**
- `POST /api/auth/log-in` — login via Telegram initData → JWT (returns 200)
- `GET /:slug` — merchant redirect into the TMA

**Require JWT:**
- `GET /api/merchants` — list (filters `?search=`, `?category=`, language via `Accept-Language`)
- `GET /api/merchants/:idOrSlug` — by ID or slug
- `POST /api/merchants` — create (admin) → 201
- `PATCH /api/merchants/:id` — update (admin: any; merchant: own only; slug: admin only)
- `GET /api/categories` — list (sorted by `order`)
- `POST /api/categories` — create (admin) → 201
- `PATCH /api/categories/:id` — update (admin)
- `DELETE /api/categories/:id` — delete (admin) → 204
- `POST /api/upload` — upload an image (any authenticated user, max 5MB)

---

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
t.me/bot/app?startapp=coffeehouse_ali
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
| `JWT_EXPIRATION` | `24h` | |
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
| `JWT_EXPIRATION` | `24h` |
| `BOT_TOKEN` | |
| `CLOUDINARY_CLOUD_NAME` | |
| `CLOUDINARY_API_KEY` | |
| `CLOUDINARY_API_SECRET` | |
| `PORT` | `8000` |
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGINS` | `http://localhost:5173,https://kuttuk-time.vercel.app` |

> `TG_BOT_USERNAME` and `TG_APP_NAME` were removed — the URL is hardcoded in redirect.controller.ts

---

## Important TODOs before prod

- [ ] Enable `origin: allowedOrigins` in CORS (currently `origin: true`)
- [ ] Add payments (Finik/Bakai/Freedom)
- [ ] When `DB_SYNC=false` on prod, apply schema changes manually. Pending: `ALTER TABLE users ALTER COLUMN "telegramId" TYPE bigint;` and `ALTER TABLE merchants ALTER COLUMN "merchantTelegramId" TYPE bigint;`
