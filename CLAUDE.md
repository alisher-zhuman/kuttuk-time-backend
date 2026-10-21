# KuttukTime Backend — Context for Claude

> **Прочитай [docs/workflow.md](docs/workflow.md) перед любой задачей** — роль, правила работы с пользователем и продом, окружение, текущее состояние и следующие шаги.

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

**Merchant payouts:** weekly (Mon–Sun, Bishkek time). Today by hand, from `npm run report:payouts` (see **Product decisions → Payouts**); automatic payouts depend on the open money-flow question.

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
2. The merchant owner opens the KuttukTime app (merchant role — there's no cashier role, see **Product decisions**)
3. Taps "Mark as used" → the code moves to the used state
4. Customer receives the service ✅

---

## Product decisions

**Decided:**
- **Roles are only `user` / `merchant` / `admin`.** No separate roles (cashier, staff) — the merchant owner redeems certificates.
- **Merchant vs venue** (decided 2026-10-20): **merchant** = the owner's business account (Telegram owner, login role, cabinet, deactivation, payouts); **venue** = a storefront the buyer sees and buys from (name, logo, description, nominals, validity, slug). One merchant can own several venues (a chain); the role stays `merchant`. Across the system (DB, API, frontend) the same split. Rules:
  - **payouts are per merchant**, summed over all its venues; a sale belongs to `orders.merchantId` — the venue's owner **at the moment of the sale** (a snapshot), so moving a venue to another merchant never rewrites past reports;
  - **redemption is by the venue's current owner** — incl. certificates sold before the venue moved to it (it's the one serving the customer); `certificates` has only `venueId`, no owner snapshot;
  - visibility to buyers = `venue.isActive AND merchant.isActive`; `merchant.isActive = false` also blocks the owner from editing its venues, but the cabinet and redemption keep working;
  - no per-venue breakdown in the payout report until someone asks.
- **Redemption is all-or-nothing.** No partial redemption.
- **Redemption is by code, and final** (decided 2026-10-20): the merchant owner types the code (any case/spacing, `KT` optional, Cyrillic look-alikes accepted) → sees amount / status / validity → taps "Redeem". No undo in the app — a mistaken redemption is fixed by hand (a script like `orders:resolve-review`, if it's ever needed); there's no money motive to undo, since payouts are per sale. QR scanning comes later and needs no backend change (it just fills the same code).
- **The merchant is paid for the sale, not for the redemption.** If the customer spends more than the nominal, they pay the difference to the merchant directly.
- **Payouts** (decided 2026-10-20, implemented as `npm run report:payouts`, `src/payouts/payouts-report.ts`):
  - only orders with `status = 'paid'` count, by `paidAt`; `needs_review` is **not** paid out until resolved by hand (the report lists them separately); `pending`/`expired`/`refunded` never count (`refunded` isn't listed either);
  - the merchant gets **90%** of the order amount, the platform keeps a **10%** commission — one constant for everyone (`PLATFORM_COMMISSION_PERCENT`; a per-merchant rate may be needed later, see TODOs). Finik's ~2% fee comes out of the platform's share and isn't part of the merchant report;
  - the period is a week, **Monday 00:00 – Sunday 23:59:59 in Asia/Bishkek**;
  - money is whole KGS; the payout is **floored on the merchant's total for the period** and the commission is the rest, so `payout + commission = gross` exactly and the merchant loses less than 1 KGS per period (flooring each order would lose up to 1 KGS per order). With today's nominals (multiples of 10) there are no fractions at all.

**Open — not decided, don't implement without discussing:**
- Undoing a mistaken redemption.
- Refunds to the buyer (an expired unused certificate, a merchant that closes).
- Money flow: today everything lands on the sole proprietorship (ИП) and the merchant's 90% is paid out by hand. NBKR (National Bank of the Kyrgyz Republic) requirements for payment aggregators haven't been checked; ask Finik about split payments.

---

## Stack

- **NestJS 10** + TypeScript + Express
- **PostgreSQL** via TypeORM 0.3
- **Passport JWT** — authentication via Telegram initData (HMAC-SHA256)
- **Cloudinary** — image storage (auto-converts to WebP)
- **Swagger** — auto-docs at `/api`
- **Throttler** — 60 requests / 60 sec per route by default; **keyed per user** for authenticated requests (`user:<id>`), by IP for public ones (see TODOs)

## Commands & conventions

- `npm run start:dev` — dev server with watch (`:3000`, Swagger at `/api`)
- `npm run build` / `npm run start:prod` — what the Dockerfile runs
- `npm run typecheck` · `npm run lint` (with `--fix`) · `npm run lint:check` (no fix, used by CI) · `npm run format` — lefthook runs typecheck + lint on **pre-push**
- `npm test` · `npm run test:int` (needs Docker) · `npm run test:all` — see **Testing**
- `npm run migration:generate | migration:run | migration:revert | migration:show` — TypeORM CLI (see **Migrations**)
- `npm run finik:smoke` — manual: creates a real 1 KGS Finik payment from `.env` and prints the URL. Not for CI
- `npm run orders:resolve-review -- --order <uuid> --issue | --refunded [--note "…"] [--by name]` — manual resolution of a `needs_review` order, see the **needs_review runbook**. Reads `DATABASE_*` from the env; refuses on a DB with pending migrations; never touches the schema
- `npm run report:payouts -- --week 2026-10-19` (any date inside the week → that whole Mon–Sun week) or `-- --from 2026-10-19 --to 2026-10-25` (Bishkek dates, inclusive) — merchant payout report. Reads `DATABASE_*` from the env (point it at prod to get real numbers), **read-only**: every query runs in a `READ ONLY` transaction and it forces `synchronize`/migrations off whatever `DB_SYNC` says. Aggregation and week boundaries are in SQL (`date_trunc('week')`, `AT TIME ZONE 'Asia/Bishkek'`). stdout: the CSV (`merchantId,merchantName,ordersCount,gross,commission,payout` + a `TOTAL` line), then the period, the file path and the `needs_review` orders to resolve first; the CSV is also saved to `./reports/payouts-<from>_<to>.csv` (`reports/` is gitignored — it holds merchants' money)
- `@/` path alias = `src/`
- **Every route requires a JWT** (global `JwtGuard` + `UserThrottlerGuard` in `app.module.ts`); opt out with `@Public()`. **Guard order matters:** global guards run in registration order, and `JwtGuard` must come first so `req.user` is set when the throttler picks its key (`test/integration/rate-limit.int-spec.ts` fails if the order flips). Side effect: requests with a missing/invalid token get 401 before the throttler and aren't counted
- Admin endpoints live in separate `admin-*.controller.ts` files under `/api/admin/*`, class-level `@UseGuards(RolesGuard) @Roles("admin")`
- `ValidationPipe({ whitelist: true })` without `transform` — unknown body fields are silently stripped (not rejected); query/params stay strings, so use `ParseIntPipe` / `ParseBoolPipe`
- `GlobalExceptionFilter` turns Postgres unique violations into 409 (`<field> "<value>" is already in use`) and logs every 5xx with a stack trace

---

## Database (current entities)

**users** — `id`, `telegramId` (unique, **bigint** — Telegram IDs exceed int4), `role` (user/merchant/admin), `language` (`ru`/`kg`/`en` or null, CHECK `users_language_valid` — the app language last seen: set from `Accept-Language` at log-in and at `POST /api/orders`; used for bot messages, null → kg), `createdAt`

**merchants** — the business account: `id`, `name` (business name — admin, payout report), `telegramId` (the owner, unique, **bigint**), `isActive`, `createdAt`, `updatedAt` (timestamptz)

**venues** — the storefront: `id`, `merchantId` (FK merchants), `name`, `description` (multilingual jsonb `{kg,ru,en}`), `categories[]`, `nominals[]`, `validityMonths` (default 12), `logo` (Cloudinary URL), `slug` (unique), `isActive`, `createdAt`, `updatedAt`. Until 2026-10-20 this was the `merchants` table (with `merchantTelegramId`); the migration `SplitMerchantsAndVenues` renamed it and made one merchant per row **with the same id** (see **Migrations**)

**categories** — `id`, `name` (multilingual jsonb `{kg,ru,en}`), `order`

**Multilingual fields are always complete** (since 2026-10-15): `venues.description` and `venues.slug` are `NOT NULL`; CHECKs `venues_description_langs` / `categories_name_langs` (`?& ARRAY['ru','kg','en']`) and `venues_nominals_not_empty` (`cardinality(nominals) > 0`), declared with `@Check` in the entities so schema diffs stay clean. DTOs validate the same with `@IsTranslations()` (`src/common/validators.ts`: exactly `ru`/`kg`/`en`, non-blank strings, extra keys → 400). PATCH DTOs use `@IsOptionalNotNull()` instead of `@IsOptional()` — a field may be omitted but not `null` (null on a NOT NULL column used to be a 500). `resolveTranslation` therefore always returns a string (unknown language → `kg`); type `Translations` in `src/common/translations.ts`.

**orders** — `id` (uuid, generated in the app, = Finik `PaymentId`), `userId` (FK users), `venueId` (FK venues — what was bought), `merchantId` (FK merchants — the venue's owner at the moment of the sale, for payouts), `amount` (int, KGS), `payoutId` (FK payouts, null = not paid out yet; CHECK `orders_payout_only_paid` — only a `paid` order can have one), `status` (`pending`/`paid`/`expired`/`needs_review`/`refunded`), `paymentUrl`, `expiresAt`, `paidAt`, `finikTransactionId` (unique), `createdAt`, `updatedAt`. Indexes `(userId, createdAt)`, `(status, expiresAt)`

**certificates** — `id` (uuid), `code` (unique, `KT-XXXX-XXXX`), `orderId` (FK, unique — one order = one certificate), `venueId` (FK venues), `ownerUserId`, `amount`, `status` (`active`/`used`/`expired`), `validUntil`, `usedAt` (set ⇔ `used`, CHECK `certificates_used_at_iff_used`), `expiryRemindedAt` (when the "expires soon" bot reminder was claimed/sent — at most once), `createdAt`

**payouts** — one money transfer to a merchant, recorded by the admin after paying by hand (`POST /api/admin/payouts`): `id` (uuid), `merchantId` (FK), `periodFrom` / `periodTo` (`date`, the Mon–Sun week), `ordersCount`, `gross`, `commission`, `payout` (a snapshot of the orders it covers, the same floor rule; CHECKs `payouts_sums_add_up`, `payouts_period_valid`), `note`, `paidBy` (FK users — the admin), `createdAt`. The orders point back via `orders.payoutId`, so an order that lands in a week after it was marked shows as **due** instead of being treated as paid. Several payouts per merchant-week are normal (a top-up). No undo in the app

**order_resolutions** — the trail of each manual decision on a `needs_review` order: `id`, `orderId` (FK orders), `action` (`issue`/`refunded`), `fromStatus`, `toStatus`, `certificateCode` (on `issue`), `note`, `resolvedBy` (OS user or `--by`), `resolvedAt`. Written in the same transaction as the status change. Separate from `finik_webhook_events` on purpose: that table is Finik's data (every row can be re-verified against its signature, `signatureValid` means something); this one is our decision

**finik_webhook_events** — audit of **every** request to the webhook, valid or not: `id`, `receivedAt`, `signatureValid`, `headers` (only `host` + `x-api-*`; the `signature` header itself is not stored), `body`, `result`, `orderId` (nullable, indexed, **no FK** so the audit row can always be written). `headers`/`body` are **`json`, not `jsonb`**: jsonb reorders keys, and nested key order is part of Finik's signature — with `json` a stored body can be re-verified later

All FKs are `ON DELETE RESTRICT` — a user/venue/merchant with orders can't be deleted. New tables use `timestamptz`; the old ones keep `timestamp without time zone`.

### Migrations

Schema changes go through TypeORM migrations in `src/database/migrations/`. Shared config: `src/database/typeorm.options.ts` (used by the app, the CLI via `src/database/data-source.ts`, and future tests).

- **Modes:** `DB_SYNC=true` → `synchronize`, no migrations (local dev DB only). Anything else → `migrationsRun: true`: pending migrations run at app start, each in its own transaction. The two never run together.
- **On Koyeb:** `DB_SYNC=false`, so `node dist/main` applies pending migrations on boot, before serving traffic. A failing migration rolls back and the app doesn't start. Single instance on the free tier, so no race. Take a `pg_dump` of prod before deploying a migration.
- **`Baseline` (1760000000000):** prod schema as of 2026-10-12, copied 1:1 from `pg_dump`. On prod (tables exist) it's a no-op that only gets recorded; on an empty DB (tests, fresh local) it creates the same schema; with only some of the tables present it refuses to run. Its `down()` throws on purpose.
- **Generating a migration — always against `kuttuktime_prodshape`**, a local DB holding the prod schema (restored from a prod `pg_dump --schema-only`; local Postgres 14 needs `\restrict`/`\unrestrict` and `SET transaction_timeout` lines stripped). Never generate against the dev DB — it's built by `synchronize` and doesn't match prod:
  ```
  DATABASE_NAME=kuttuktime_prodshape npm run migration:run        # bring it up to the latest migration
  DATABASE_NAME=kuttuktime_prodshape npm run migration:generate -- src/database/migrations/<Name>
  npx prettier --write src/database/migrations
  ```
  Then check it: run it on `kuttuktime_prodshape`, `migration:generate -- … --dr` must print "No changes", and `migration:revert` must work.
- **Rule: read the full SQL of every migration before committing.** Look especially for `DROP` and for `ALTER` on existing columns that hold data. `migration:generate` drops whatever the entities don't declare — that's how the first draft tried to drop prod's hand-made GIN index.
- **`SplitMerchantsAndVenues` (1792500000000, 2026-10-20)** — moves data, so it's done by **renaming**, not drop + create: `merchants` → `venues` (with its sequence, PK, slug UNIQUE, both CHECKs and the GIN index renamed to the names TypeORM derives for `Venue`), a new `merchants` table filled with one row per venue **with the same id** (name = venue name, `telegramId` = the old `merchantTelegramId`, `isActive` = the old `isActive`; all venues become active, so visibility doesn't change; old timestamps are UTC), `venues.merchantId` = its own id, `orders.merchantId` → `venueId` (+ a new `merchantId` = the owner snapshot), `certificates.merchantId` → `venueId`. Checked on a copy of prod with data and in CI (`migrations.int-spec.ts` reverts it, fills the old shape, applies it again). `down()` works while every merchant owns at most one venue and refuses otherwise.
- **`venues_categories_idx`** (until 2026-10-20 `merchants_categories_idx`) — a GIN index on `venues.categories`, created by hand on prod. TypeORM can't declare GIN indexes, so the entity marks it `@Index(..., { synchronize: false })` to keep it from being dropped. Note: the code filters with `:category = ANY(categories)`, which GIN doesn't speed up (it would need `categories @> ARRAY[:id]`).

---

## Roles

| Role | Who | Permissions |
|------|-----|-------------|
| `user` | buyer | browse venues, purchase |
| `merchant` | business owner | edit own venues, cabinet (summary, certificates), redeem |
| `admin` | Alisher (system owner) | full access to everything |

**Auto-logic:** on login — if `telegramId` matches an active merchant (`merchants.telegramId`), the role automatically becomes `merchant` (even with no venues yet).

**How the role is enforced:** the role is read from the DB at login time and baked into the JWT payload. `JwtStrategy` verifies the token signature (JWT_SECRET) on every request and puts `{ userId, role, telegramId }` on `request.user`; `RolesGuard` compares it against `@Roles(...)`. The role is a snapshot from login — changing it in the DB requires a fresh `log-in` to take effect. `admin` is only assigned manually via SQL (`UPDATE users SET role='admin' WHERE ...`).

`@Roles(...)` works on a class or a method (method overrides class); it needs `@UseGuards(RolesGuard)` alongside. `log-in` rejects initData older than 24h (`auth_date`) — deliberately not shorter, since Telegram doesn't refresh initData while the Mini App is open and the frontend re-logs-in with it on 401. **`log-in` fails closed without `BOT_TOKEN`** (empty / whitespace / unset → 401 "Log-in is unavailable" + an error log, also logged once at boot): otherwise the HMAC key would be `HMAC("WebAppData", "")`, which anyone can compute, and initData could be forged for any `telegramId` — an admin included. The rest of the app keeps working. Covered by `test/integration/auth.int-spec.ts` (independent signer in `test/helpers/init-data.ts`, the `signature` field, tampering, the 24h/60s window, the `user` field, roles).

---

## API (already built)

**Public (no JWT):**
- `POST /api/auth/log-in` — login via Telegram initData → JWT (returns 200)
- `GET /:slug` — venue redirect into the TMA (redirects to `t.me/kuttuk_time_bot/app?startapp=:slug`)
- `GET /api/payments/return/:orderId` — where Finik sends the buyer after paying; **302** to the Mini App on that order (see **Payment RedirectUrl**). No JWT, default rate limit by IP, hidden from Swagger
- `GET /api/venues/options` → `{ nominals: number[], validityMonths: number[] }` from `VALID_NOMINALS` / `VALID_VALIDITY_MONTHS` (`src/venues/venue.constants.ts`), sorted ascending. **Rule: the backend is the single source of allowed venue values** — the frontend doesn't keep its own lists, it reads them from here (the DTOs validate against the same constants). Default rate limit, by IP (public)

**Venues — the buyer's storefront (any authenticated role), resolved shape** (`src/venues/`):
- `GET /api/venues` — visible only (`venue.isActive AND merchant.isActive`), filters `?search=`, `?category=` (id), language via `Accept-Language` → `[{ id, name, description, logo, minNominal }]`
- `GET /api/venues/:idOrSlug` — by ID or slug, visible only (otherwise 404) → `{ id, name, description, logo, nominals, validityMonths }`. Static routes (`options`) are declared before it, so those words are **reserved slugs** (`RESERVED_SLUGS` = `me`, `options`; rejected by the create/admin-update DTOs) — a venue with such a slug would be unreachable here and its `startapp=<slug>` deep link would get the wrong response. Add any new `GET /api/venues/<word>` to `RESERVED_SLUGS`

**Merchant cabinet (role: merchant)** — everything under `/api/merchants/me`; the merchant is looked up by `telegramId` (`ownMerchantId`; a deactivated one still counts). Cabinet data is **for the whole merchant** (all its venues — payouts are per merchant), optionally narrowed with `?venueId=` (must be one of its venues, otherwise 404):
- `GET /api/merchants/me` → `{ id, name, isActive, venues: [{ id, name, description (raw {ru,kg,en}), categories, nominals, validityMonths, logo, slug, isActive, createdAt }] }` — all its venues, active or not. No merchant for this Telegram account → 404
- `PATCH /api/merchants/me/venues/:venueId` — edit own venue's storefront (`name`, `description`, `categories`, `nominals`, `validityMonths`, `logo`; `slug`/`isActive`/the owner are admin-only and silently stripped) → the whole venue (same shape as above). Not its venue → 404; merchant deactivated → 403
- `GET /api/merchants/me/certificates/:code` — look up a certificate of **any of its venues** by code before redeeming → `{ code, amount, status, validUntil, createdAt, usedAt?, venue: { id, name } }` (effective status, `usedAt` only for `used` — same rules as `/certificates/my`). Code normalized by `normalizeCertificateCode` (`src/certificates/certificate-code.ts`). Not a code → 400; another merchant's or unknown → the same 404 (nothing leaks)
- `POST /api/merchants/me/certificates/:code/redeem` → 200 + the certificate with `usedAt`. **One atomic `UPDATE … FROM venues WHERE code AND venue.merchantId = me AND status = 'active' AND validUntil > now()`** (`src/certificates/redemption.service.ts`) — concurrent taps redeem once. Scope = the venues it owns **now**. Otherwise **409** with `error: "already_used"` or `error: "expired"` (re-fetch the `GET` for `usedAt`), 404 as above. A **deactivated** merchant can still redeem. Only the `merchant` role (admin → 403). Default rate limit, per user
- `GET /api/merchants/me/summary?week=YYYY-MM-DD&venueId=` — weekly summary (Mon–Sun, Bishkek; any date inside the week, default — the current week) → `{ from, to, sold: { count, amount }, commission, payout, redeemed: { count, amount }, paidOut?, due? }` — `paidOut` / `due` (as in the admin payouts) for the whole merchant only, absent with `?venueId=` (payouts are per merchant). Sold / commission / payout come from **`paidSales()`** (`src/payouts/payouts-report.ts`) — the same function as the payout report, so the cabinet and the report can't disagree (by `orders.merchantId`, the sale-time owner); redeemed = certificates of its current venues whose `usedAt` falls in that week (whatever the sale date). Bad `week` → 400
- `GET /api/merchants/me/certificates?status=&limit=&cursor=&venueId=` — certificates of its venues, newest first (`createdAt DESC, id DESC`), optional effective `status` (`active`/`used`/`expired`) → `{ items: [{ code, amount, status, validUntil, createdAt, usedAt?, venue: { id, name } }], nextCursor }`. **Keyset pagination**: `limit` 1–100 (default 50), pass `nextCursor` back as `cursor`, `null` = last page; the cursor is opaque base64url of `createdAt|id`, so new sales never shift pages already read. Bad `status`/`limit`/`cursor` → 400 (`src/certificates/merchant-cabinet.*`)

**Merchants — admin (role: admin), business accounts, under `/api/admin/merchants`:**
- `GET /api/admin/merchants` — `[{ id, name, telegramId, isActive, createdAt }]`, filters `?search=` (name), `?isActive=`
- `GET /api/admin/merchants/:id` — the account + `venues` (same shape as in `GET /merchants/me`)
- `POST /api/admin/merchants` — `{ name, telegramId }` → 201 (the owner gets the role on the next log-in); `telegramId` taken → 409
- `PATCH /api/admin/merchants/:id` — `{ name?, telegramId?, isActive? }`

**Venues — admin (role: admin), raw shape, under `/api/admin/venues`:**
- `GET /api/admin/venues` — `[{ id, name, logo, isActive, merchantId }]`, filters `?search=`, `?category=`, `?isActive=`, `?merchantId=`
- `GET /api/admin/venues/:id` — the full venue + `merchantId`
- `POST /api/admin/venues` — `{ merchantId, name, description, categories, nominals, validityMonths, logo, slug }` → 201; unknown `merchantId` → 400; slug taken → 409
- `PATCH /api/admin/venues/:id` — update any field incl. `slug`, `isActive`, `merchantId` (moves the venue: past sales stay paid out to the old owner, redemption moves to the new one)

**PATCH responses and DTOs:** with `target: ES2024` a DTO instance has every declared field, the omitted ones as `undefined`; updates apply `definedFields(dto)` (`src/common/utils/defined-fields.ts`), otherwise the response loses every field that wasn't sent (the DB was fine — TypeORM skips `undefined`). Found 2026-10-20; the old `PATCH /merchants/me` had it too.

**Payouts — admin (role: admin):**
- `GET /api/admin/payouts?week=YYYY-MM-DD` — the payout report as JSON (`src/payouts/admin-payouts.*`): any date inside the week, default — the current week (Bishkek) → `{ from, to, merchants: [{ merchantId, merchantName, ordersCount, gross, commission, payout, paidOut, due, payouts: [{ id, payout, ordersCount, note?, paidBy, createdAt }] }], total: { …the same + paidOut, due }, needsReviewCount }`. **The same `buildPayoutReport()`** as `npm run report:payouts` (and `paidSales()` as the cabinet), read-only; `paidOut` = recorded payouts for the week, `due` = the merchant's share of its paid orders not covered by a payout yet (`payoutProgress()`, `src/payouts/payout-ledger.ts`); `payouts` = the week's recorded payouts, oldest first, with the admin's `note` (admin only — the owner never sees the note); `needsReviewCount` = the week's `needs_review` orders, not in `merchants` (resolve them first). Bad `week` → 400
- `POST /api/admin/payouts { merchantId, week, note? }` — **mark a merchant's week as paid out**, after transferring the money by hand → 201 `{ id, merchantId, from, to, ordersCount, gross, commission, payout, note?, paidBy, createdAt }`. Covers the merchant's `paid` orders of the week with no `payoutId`; **the amount is computed on the server** (a client-sent one is stripped). Nothing left → **409** `error: "nothing_to_pay_out"`. Two guards against paying twice, each enough on its own (`markPaidOut()`): the orders are `SELECT … FOR UPDATE`, and the `UPDATE` links only rows still without a `payoutId` and rolls back unless it linked all of them — `payouts-ledger.int-spec.ts` forces two marks to overlap behind a held lock and fails only when both guards are gone. Then a bot message to the owner (best-effort, not awaited): «💸 Выплата: 27 сом за 19.10–25.10, продаж 3 на 30, комиссия 3». Unknown `merchantId` → 400. No undo (fix by SQL)

**Orders — admin (role: admin), read-only** (`src/orders/admin-orders.*`; resolving `needs_review` stays the CLI):
- `GET /api/admin/orders?status=&venueId=&merchantId=&search=&limit=&cursor=` — newest first (`createdAt DESC, id DESC`), keyset pages `{ items, nextCursor }` (the same `src/common/utils/keyset-page.ts` as the cabinet list). `status` ∈ pending/paid/expired/needs_review/refunded; `merchantId` = the sale-time owner (`orders.merchantId`); `search` = a certificate code (normalized like redemption) or an order uuid, anything else → 400. Item: `{ id, amount, status, createdAt, paidAt?, venue: { id, name }, merchant: { id, name }, certificateCode?, payoutId? }` — `paidAt` / `certificateCode` / `payoutId` only when set
- `GET /api/admin/orders/:id` — the item + `expiresAt`, `finikTransactionId?`, `buyer: { userId, telegramId }`, `certificate?: { code, status (effective), validUntil, usedAt? }`, `webhooks: [{ receivedAt, result, amount }]` (what Finik sent — for `needs_review` compare `amount`), `resolutions: [{ action, fromStatus, toStatus, certificateCode?, note?, resolvedBy, resolvedAt }]`. Unknown → 404, not a uuid → 400

**Categories — public (any authenticated role):**
- `GET /api/categories` — sorted by `order`, `name` resolved to one language via `Accept-Language`

**Categories — admin (role: admin), raw `{kg,ru,en}` shape, under `/api/admin/categories`:**
- `GET /api/admin/categories` — list
- `POST /api/admin/categories` — create → 201
- `PATCH /api/admin/categories/reorder` — reorder (body: full ordered array of ids)
- `PATCH /api/admin/categories/:id` — rename only
- `DELETE /api/admin/categories/:id` — delete, also strips the id from any venue's `categories` → 204

**Upload (role: merchant or admin):**
- `POST /api/upload` — upload an image (multipart field `file`), max 5MB → 413 if larger, 400 if missing/not an image

**Orders (any authenticated role):**
- `POST /api/orders` — body `{ venueId, nominal }` → 201 `{ orderId, paymentUrl, expiresAt }`. The amount is the nominal, checked against the venue's **current** `nominals` (client amounts are never trusted). Venue missing / not visible (venue or its merchant inactive) or nominal not offered → 400. The order stores `venueId` and `merchantId` = the venue's owner now; Finik `nameEn` = the venue name. Creates an order `pending` for 30 min, then calls `FinikService.createPayment`. If Finik fails (API/network/timeout) → the order goes `expired` (kept, not deleted: on a timeout Finik may still have created the payment, and a later webhook must find it) and the client gets 502 without Finik details. Rate limit 10/min **per user**
- `GET /api/orders/:id` — for polling after payment. Only the owner; anyone else's order → 404. Non-uuid → 400. Returns `status`, `amount`, `venueId`, `expiresAt`, `paidAt`, `paymentUrl` (only while `pending`) and `certificate: { code, validUntil }` once `paid`. `status` is one of `pending` / `paid` / `expired` / `needs_review` / `refunded` and is returned as is; `paymentUrl` is non-null only for `pending`, `certificate` only for `paid` (so `needs_review` and `refunded` have both `null`). Rate limit 60/min **per user** (the frontend polls every 3 s = 20/min)

**Certificates (any authenticated role):**
- `GET /api/certificates/my` — the caller's certificates (`ownerUserId` = current user), contract agreed with the frontend (`../frontend/src/entities/certificate/model/schemas.ts`) — **don't change the shape without the frontend**: `{ id, code, amount, status, validUntil, usedAt?, createdAt, venue: { id, name, slug, logo } }` (`merchant` → `venue` on 2026-10-20). `status` is the **effective** one (see below); `usedAt` key is present **only** for `used` (absent, not null, otherwise). Sorted in SQL: effective `active` first, then newest first (`createdAt DESC`). One query with the venue joined (`src/certificates/certificates.service.ts`); certificates of deactivated venues / merchants are included. Default rate limit (60/min per user). No pagination yet (see TODOs)

**Statuses:**
- Order: `pending → paid | expired | needs_review`, and `expired → paid | needs_review` (a payment can land after the QR expired — the money is taken, so it's honoured); then, by hand only (`orders:resolve-review`), `needs_review → paid` (+ certificate) or `needs_review → refunded`. **Terminal:** `paid` and `refunded` — the cron moves only `pending` with `expiresAt < now` to `expired` (every minute, `OrdersService.expireStale`), and the webhook never changes `paid`/`needs_review`/`refunded` (a retry → `already_<status>`). `paid`/`needs_review` come from the Finik webhook, `refunded` only from the script. `GET /api/orders/:id` returns every status as is
- Certificate: `active → used | expired`. **Effective status is computed on read:** `active` in the DB with `validUntil < now()` is returned as `expired` — there's no cron for certificates, so the stored `active` may already be expired. **Redemption (`POST /api/merchants/me/certificates/:code/redeem`) checks `validUntil`, not just `status = 'active'`**, and sets `usedAt` together with `status = 'used'` — the frontend parses the whole list with a schema that requires `usedAt` on `used`, so one `used` row without it breaks the user's entire list — the DB enforces it: CHECK `certificates_used_at_iff_used` = `(status = 'used') = ("usedAt" IS NOT NULL)`, i.e. `used` ⇔ `usedAt` set, both ways. Created only by the webhook, in the same transaction that marks the order `paid`. `validUntil = addMonths(paidAt, venue.validityMonths)` — calendar months in UTC, clamped to the month's last day (Jan 31 + 1 → Feb 28/29; `src/common/utils/add-months.ts`). Code `KT-XXXX-XXXX` from a 32-symbol alphabet without `0/O/1/I`, `crypto.randomInt` (`src/certificates/certificate-code.ts`)

**Finik webhook — `POST /api/finik/webhook`** (`src/orders/finik-webhook.{controller,service}.ts`, signature check in `src/finik/finik-webhook.verifier.ts`). Public (`@Public`), not throttled (`@SkipThrottle`), hidden from Swagger. Answers **200** = "don't retry", **401** = bad signature, **5xx** = Finik retries (up to a day).
- **Signature:** our `finik-signer` + Finik's public key (`FINIK_PUBLIC_KEY_B64`). Host and path come from **`FINIK_WEBHOOK_URL`**, not from the request (behind Koyeb's proxy they differ) — so it must be **exactly** the public URL Finik calls, with `/api`: `https://kuttuk-time.koyeb.app/api/finik/webhook`; anything else and every webhook gets 401. `x-api-*` headers and the query come from the request, the body is the parsed JSON as is (key order preserved), the signature from the lower-case `signature` header. No timestamp-freshness check on purpose: Finik retries for up to 24h; idempotency protects against replays. Retries **are re-signed** (seen on prod: the retry carried a new `x-api-timestamp`).
- **Duplicate deliveries happen** — idempotency is what makes them harmless. Seen once on prod (2026-10-17, order `b82c37ec…`, 500 KGS): Finik sent the same webhook again 28 s later → `paid`, then `already_paid`, one certificate. Not a cold start: the app had handled `POST /orders` 62 s earlier, the request reached us 0.6 s after Finik signed it, and the transaction started 35 ms after that. The other paid orders (19.10, 20.10) got a single delivery. Why Finik retried is unknown (its timeout / success criterion / retry schedule aren't documented) — not worth chasing while it's harmless.
- **Processing** (one transaction, `SELECT … FOR UPDATE` on the order, so concurrent deliveries serialize). The order is `body.fields.paymentId` (= our `order.id`). The `result` written to the audit:
  - `invalid_signature` → 401, logged without the body
  - `order_not_found` — unknown or non-uuid `paymentId` → 200 (retrying is pointless)
  - `ignored_status: <status>` — `body.status` isn't `success`/`succeeded` (case-insensitive) → 200, order untouched
  - `already_paid` / `already_needs_review` / `already_refunded` — duplicate delivery, or an order already resolved by hand → 200, no-op
  - `needs_review: amount_mismatch` — `body.amount !== order.amount` → order `needs_review`, `paidAt` + `finikTransactionId` filled, **no certificate**, error log → 200
  - `paid` / `paid_after_expiry` — order `paid`, `paidAt = body.transactionDate` (fallback now), `finikTransactionId = body.id`; certificate issued (owner = buyer). Code collisions retried up to 5× via `INSERT … ON CONFLICT (code) DO NOTHING` (catching the error would abort the transaction). The paying + issuing itself lives in `src/orders/order-fulfillment.ts` (`lockOrder`, `payAndIssueCertificate`) — shared with the manual `--issue`, so a certificate is issued the same way either way
  - `error: <message>` — anything unexpected → everything rolled back, 500, Finik retries
- **Audit** is written first, outside the payment transaction (`received`, then the final `result`), so it survives a rollback. To re-check a disputed webhook: take `body` + `headers` from `finik_webhook_events` and run them through `FinikWebhookVerifier.verify` with the signature from Finik.

**needs_review runbook.** `needs_review` = a valid webhook came, but `body.amount` didn't match the order: Finik took money, **no certificate was issued**, nothing is paid out to the merchant for it.
1. **Find them** — the weekly payout report lists them under the CSV (`npm run report:payouts -- --week <date>`), or in SQL: `SELECT o.id, o.amount, o."paidAt", o."finikTransactionId", e.body->>'amount' AS paid FROM orders o JOIN finik_webhook_events e ON e."orderId" = o.id AND e.result LIKE 'needs_review%' WHERE o.status = 'needs_review';`
2. **Check in Finik's cabinet** the real transaction by `finikTransactionId`: the amount actually charged, and that it's one charge (not a duplicate).
3. **Decide:**
   - the real charge equals the order amount (the webhook's `amount` was wrong or in other units) → **`--issue`**: `npm run orders:resolve-review -- --order <id> --issue --note "Finik cabinet: 1000 KGS, txn …"`. One transaction with the order locked: `paid` + the certificate through the same code as the webhook; `paidAt` stays as recorded (falls back to now only for old rows without it). Prints the certificate code — send it to the buyer;
   - the charge is wrong (less/more than the order, or a double charge) → return the money **outside the system** (Finik has no refund API), then **`--refunded`** with a note on how/when: `npm run orders:resolve-review -- --order <id> --refunded --note "returned 990 KGS by bank transfer 2026-10-21"`.
4. Only `needs_review` orders are accepted — anything else is an error and nothing changes. Every run writes a row to `order_resolutions` (who, when, note, the code). A webhook retry afterwards is a no-op (`already_paid` / `already_refunded`), so a manual decision is never overwritten.

**Payment RedirectUrl → back to the order.** The chain:
1. `OrdersService` sends Finik `RedirectUrl = <public origin>/api/payments/return/<order.id>` (`paymentReturnUrl`, `src/orders/payment-redirect-url.ts`). The public origin is the origin of **`FINIK_WEBHOOK_URL`** — it already has to be our exact public URL (webhook signatures are checked against its host, and they verify on prod), so no extra env to forget on Koyeb. If the webhook ever moves to another host, the return URL moves with it.
2. After paying, Finik sends the buyer there (through its own `/v1/redirect` hop). Confirmed on prod by the logs: Finik appends `?paymentId=…&status=succeeded` with a `?` regardless of an existing query — which is what broke the direct t.me link.
3. `GET /api/payments/return/:orderId` (`src/orders/payment-return.controller.ts`) answers **302** to `paymentRedirectUrl(FINIK_REDIRECT_URL, orderId)` = `https://t.me/kuttuk_time_bot/app?startapp=order_<id>`; a non-UUID id → 302 to the bare `FINIK_REDIRECT_URL`. Whatever query Finik appends is ignored. The order is **not** looked up — the answer is the same for any UUID, so nothing is disclosed. It logs the full incoming URL (`Payment return: …`) to see what Finik appends.
4. Telegram opens the Mini App with that start param; the frontend routes `order_<uuid>` to the order screen before any role-based redirect.

**Why not give Finik the t.me link directly** (what we did first): seen twice on prod — Finik's intermediate redirect led to the t.me page → "OPEN APP" → the bot chat with "An error occurred", while opening `t.me/kuttuk_time_bot/app?startapp=order_<id>` by hand works. So Finik mangles the link it's given; now it only ever gets a plain https URL of ours and the final link is built on our side. `paymentRedirectUrl` builds it with `URL`/`searchParams` (an existing query in `FINIK_REDIRECT_URL` survives, an existing `startapp` is replaced). **The prefix is shared with the frontend:** `ORDER_START_PARAM_PREFIX = "order_"` in `../frontend/src/shared/constants/base.ts` — change both together; it can't collide with a merchant deep link (slugs are `/^[a-z0-9-]+$/`, no underscore). `/api/payments/*` doesn't clash with the `GET /:slug` middleware in `main.ts` (it skips everything under `/api`). `FinikService.createPayment` takes `redirectUrl` as a parameter; `npm run finik:smoke` passes the bare `FINIK_REDIRECT_URL` (no order behind it).

**Finik (`src/finik/`):** `finik.config.ts` (env, base64 → PEM), `finik-signer.ts` (our own request signer on `node:crypto`, byte-for-byte compatible with `@mancho.devs/authorizer`, which is only a devDependency for parity tests), `finik.service.ts` (`createPayment`: `POST /v1/payment`, `redirect: 'manual'`, 302 `Location` = payment URL, 15s timeout). The doc's test-vector signature doesn't match Finik's published beta public key — need a matching key/signature pair from Finik (that test is `it.skip` until then).

---

## Project status — where we stopped

- **2026-07-02 → 07-14:** active development. Last feature: `GET /merchants/me` (07-10). PR #34 merged to `main` on 07-14. Frontend's last commit before the break: 07-15 (merchant profile edit).
- **~2.5-month break.**
- **2026-09-30:** full review + fix pass (RolesGuard ignored class-level `@Roles` → any user could reach `/api/admin/*`; JWT lived 7d instead of 2h; initData had no `auth_date` expiry; 5xx weren't logged; upload without file → 500; inactive merchants visible by id/slug; weak merchant DTO validation; old logo deleted before save). Frontend got a similar pass the same day. Merged to `main` via PR #35 the same day — **`main` has everything up to 09-30** (Koyeb deploys `main`). Local `main` can be stale — `git fetch` before comparing.
- **2026-10-12:** Finik access arrived. Built on `dev`: Finik config + signer + `createPayment`, Orders/Certificates (`POST /api/orders`, `GET /api/orders/:id`, expiry cron), TypeORM migrations with a prod baseline. `FinikModule` is now part of the app (via `OrdersModule`), so **the app won't start without `FINIK_*` env** — don't merge to `main` before they're set on Koyeb.
- **Also 2026-10-12:** the Finik webhook (signature check, audit, `paid` + certificate, `needs_review` on amount mismatch). Not yet verified against a **real** Finik webhook — the doc's test vector doesn't match their beta key; the first real one lands in `finik_webhook_events` either way.
- **Next:** redemption ("mark as used") and the merchant cabinet; a real end-to-end payment on Finik beta.
- **Before merging `dev` → `main`** (the 10-12 work): full `pg_dump` of prod, rotate the prod DB password + update `DATABASE_*` on Koyeb, set `FINIK_*` on Koyeb, CI green — then merge. The first boot records `Baseline` and creates `orders`/`certificates`/`finik_webhook_events`. Frontend: buy button + certificates tab still need wiring to the new endpoints.

## What still needs building (MVP)

The main things not yet implemented:

1. **Orders module** — ✅ orders, certificates issued on payment (webhook); ✅ redemption by code (merchant API); still missing: the merchant cabinet UI
2. **Payment integration** — Finik: ✅ payment creation + webhook (not yet tried with a real Finik webhook). Bakai / Freedom: not started
3. **Merchant cabinet** — ✅ backend and frontend: redemption by code, weekly summary, certificate list (paginated), several venues, sale notifications; still missing: QR scanning
4. **Weekly reports** — automatic calculation and merchant notification every Monday

---

## Testing

**Commands:**
- `npm test` — unit tests: `src/**/*.spec.ts` (config `jest.config.js`), parallel, no DB, no Docker
- `npm run test:int` — integration tests: `test/**/*.int-spec.ts` (config `jest.int.config.js`) against a real Postgres. **Requires Docker running** (Testcontainers starts `postgres:18`, the same major as prod; one container per run). ~4 s locally
- `npm run test:all` — both. CI (`.github/workflows/ci.yml`) runs `lint:check`, `typecheck`, `test`, `test:int` and `npm audit` on push to `dev`/`main` and on PRs to `main`

**Kinds of tests:**
- **Unit** (`*.spec.ts`, next to the code): mocked repositories/`fetch`/Finik — `finik-signer`, `finik.service`, `certificate-code`, `orders.service`
- **Property-based** (`*.property.spec.ts`, fast-check, part of the unit run): only where an oracle exists — the signer vs `@mancho.devs/authorizer` (canonical string, cross-sign/verify) and the certificate-code generator (`generateCertificateCode(random)` takes an injectable index source for this)
- **Integration** (`test/integration/*.int-spec.ts`): HTTP via Supertest against the real `AppModule` (orders, webhook, certificates, rate limits, DTO validation), migrations on an empty DB, DB constraints

**Integration rules:**
- Integration tests live **only** in `test/` and are named `*.int-spec.ts` — the unit config never picks them up, and `tsconfig.build.json` keeps `test/` out of `dist`
- **The schema is built only by our migrations**, never `synchronize`: the test app boots with `DB_SYNC=false`, so `migrationsRun` applies `Baseline` + the rest — the same path as Koyeb. `test/helpers/db.ts` refuses to run against anything but the container DB or with `synchronize` on
- **Isolation = `TRUNCATE … RESTART IDENTITY CASCADE`** of all entity tables (not `migrations`) before each test (`t.reset()`), not a transaction per test — requests go through TypeORM's connection pool, which a single test transaction wouldn't cover. Hence `maxWorkers: 1`: files share one DB and must not run in parallel
- **Cron is off in tests:** the test app overrides `SCHEDULE_MODULE_OPTIONS` with `{ cronJobs: false, … }`, so `@Cron` jobs are never registered (`createTestApp` throws if any are). Test cron logic by calling the method directly (`app.get(OrdersService).expireStale()`)
- `globalSetup` sets **every** env var the app reads (DB, JWT, Cloudinary, Finik with generated PEM keys) — explicit `process.env` beats the local `.env`, and CI has none
- Helpers: `createTestApp()` (`test/helpers/app.ts`: real `AppModule`, `FakeFinikService` recording calls / `failWith`, `tokenFor(user)` via the app's own `JwtService`), factories `createUser`/`createMerchant`/`createOrder`/`createCertificate` (`test/helpers/factories.ts`)
- Known noise: a `pg` "client.query() when the client is already executing a query" deprecation warning comes from inside TypeORM's schema builder — not our code, but it becomes an error with `pg@9`

**What to cover next (riskiest first):** initData verification is covered (2026-10-20, `auth.int-spec.ts`); (redemption is covered: `test/integration/redemption.int-spec.ts`, incl. 10 concurrent redeems → one success).

Beyond tests, verify changes by exercising the real flow, not by assuming.

**Local verification recipe (worked well):**
- `npm run typecheck` + `npx eslint <file>` + `npx prettier --write <file>` — same checks lefthook runs on pre-push
- Local Postgres is expected on `localhost:5432` (`pg_isready`); start the app with `npx nest start`, wait for `curl localhost:3000/api`. To stop it, kill whatever listens on the port: `kill $(lsof -tiTCP:3000 -sTCP:LISTEN)`. **Not** `pkill -f "nest start"`: that kills only the `nest` wrapper, and the `node dist/main` it spawned keeps holding `:3000`, so the next start silently fails while `curl` still answers from the old process
- Prod-like boot check: `npm run build`, then `DB_SYNC=false DATABASE_NAME=kuttuktime_prodshape PORT=3999 node dist/main` — runs migrations on start exactly like Koyeb
- Finik without hitting the real API: run a tiny local HTTP stub and start the app with `FINIK_BASE_URL=http://127.0.0.1:<port>` (shell env wins over `.env`). The local `.env` holds real beta keys — don't create real payments without asking
- Role/guard checks: sign a JWT with `JWT_SECRET` from `.env` via `new (require('@nestjs/jwt').JwtService)({secret}).sign({userId, role, telegramId})` — no Telegram needed
- Login checks: build initData in node (sorted `k=v` lines, HMAC key = `HMAC("WebAppData", BOT_TOKEN)`) and POST to `/api/auth/log-in`; delete the test user afterwards (`DELETE FROM users WHERE "telegramId"=...`)
- Prod rate-limit state is visible in `X-RateLimit-Limit`/`X-RateLimit-Remaining` response headers. On authenticated routes the counter is yours (`user:<id>`); on public routes it's shared with everyone behind the same proxy node — probe those with a few requests only

---

## Bot — messages (built) and commands (future ideas)

**Built (2026-10-21): sale notifications** (`src/orders/sale-notifier.ts`, texts in `src/orders/sale-messages.ts`, sending in `src/telegram/telegram-bot.service.ts` — plain `fetch` to the Bot API with `BOT_TOKEN`, no library):
- **When:** after the Finik webhook commits `paid` / `paid_after_expiry` — only on that transition, so a retried delivery (`already_paid`) never sends twice; `needs_review` / `--issue` by hand send nothing (the runbook says to send the code by hand). **Not awaited** — Finik's answer never waits on Telegram.
- **To the buyer** (`orders.userId`): venue, amount, the code in `<code>` (copied on tap), valid until (dd.mm.yyyy, Bishkek), button "Open certificate" → `t.me/…/app?startapp=order_<id>`.
- **To the owner** (`merchants.telegramId` of `orders.merchantId`, the sale-time owner): "🎉 New sale: <venue> — <amount>", button → the Mini App. **No buyer data, no code.**
- **Language:** `users.language` (the owner's — via a users row with the same `telegramId`, if it ever logged in); unknown → kg. HTML parse mode, user data escaped.
- **Best-effort:** never throws, no retries, no outbox. A user who never started the bot / didn't allow messages → Telegram 403 → a `warn` in the logs, nothing else. Logs never contain the token (it's in the URL).
- **Redemption notice (2026-10-21)** (`src/certificates/redemption-notifier.ts`, texts in `redemption-messages.ts`): after a **successful** redeem only (the request whose atomic `UPDATE` matched — 409/404 and the losers of a race send nothing), to the certificate's owner (`ownerUserId`) in their language: «✅ Сертификат KT-… в <venue> на 500 сом использован 21.10.2026 в 14:30. Если это были не вы — напишите нам», button → support (`SUPPORT_URL` in `src/telegram/links.ts`, the same as the frontend's). Not awaited, like the sale notice. The merchant gets nothing — they pressed the button themselves.
- **Payout notice** — see `POST /api/admin/payouts`.
- **Expiry reminder (2026-10-21)** (`src/certificates/expiry-reminders.service.ts`, texts in `expiry-messages.ts`): an `active` certificate with `validUntil` within **7 days** and no `expiryRemindedAt` → «⏳ Сертификат KT-… в <venue> на 500 сом действует до 28.10.2026. Не забудьте воспользоваться», button → its order in the Mini App. `@Cron` **every hour**, but sends only **09:00–21:00 Bishkek** — hourly, not daily, because Koyeb sleeps and a fixed daily run could be missed; the 7-day window catches up. Each certificate is **claimed before sending** (`UPDATE … SET expiryRemindedAt … FROM (SELECT … FOR UPDATE SKIP LOCKED)`), so overlapping runs remind once; a refused send (403) isn't retried. Batch 100 per run. Tests call `run(now)` directly (cron is off in tests).
- **Frontend side:** `requestWriteAccess` — the buyer at the moment of purchase, the owner from the cabinet ("notify me about sales"). Without it the bot reaches only people who started it.


Since there's no sign-up, the bot chat is effectively the user's only "account". Organized by roadmap phase.

**Important finding (verified by hand):** simply opening the TMA via a deep link and browsing does NOT create a persistent bot chat, even after passing Telegram's native ToS screen. The bot sticks in the user's chats only if write access is actually granted. Without it, once the TMA is closed the bot vanishes without a trace — no channel to that user remains.

**From Alisher's notes (2026-10-21) — to do / to research:**
- **`/start` is empty** — a buyer who lands in the bot chat (every sale/redemption message brings them there) sees nothing. Needs incoming updates (a bot webhook — today we only send) and a welcome reply with an "open the app" button, in the user's language.
- **Menu / launch button text** ("Открыть" etc.) and the bot's description / short description / commands — **multilingual** (the Bot API takes a `language_code` for these).
- **Research:** how a bot gets the **verified** checkmark (BotFather has one); what changes after **10k monthly users**; whether a bot can publish **posts or stories**; and generally which UI features a bot and its chat have (menu button, commands, inline mode, descriptions, profile "Open App") — to decide what's worth using.

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
| `DB_SYNC` | `true` | **dev only**. `true` = `synchronize`, anything else = run migrations on start |
| `JWT_SECRET` | `...` | long random string |
| `JWT_EXPIRATION` | `2h` | short-lived — token isn't persisted on the frontend (in-memory only), it silently re-logs-in via Telegram initData on 401, so a long TTL only adds risk without any UX benefit |
| `BOT_TOKEN` | `...` | from @BotFather, for initData verification |
| `CLOUDINARY_CLOUD_NAME` | `...` | |
| `CLOUDINARY_API_KEY` | `...` | |
| `CLOUDINARY_API_SECRET` | `...` | |
| `PORT` | `3000` | `8000` on Koyeb |
| `NODE_ENV` | `development` | `production` in prod |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | add the vercel URL in prod |
| `FINIK_BASE_URL` | `https://beta.api.acquiring.averspay.kg` | **required** — the app won't start without any `FINIK_*` |
| `FINIK_API_KEY` | `...` | |
| `FINIK_ACCOUNT_ID` | `...` | |
| `FINIK_PRIVATE_KEY_B64` | `...` | `base64 -i finik_private.pem \| tr -d '\n'` (`*.pem` is gitignored) |
| `FINIK_PUBLIC_KEY_B64` | `...` | Finik's public key, base64 — for webhook verification |
| `FINIK_WEBHOOK_URL` | `https://kuttuk-time.koyeb.app/api/finik/webhook` | sent to Finik with each payment **and** used to verify webhook signatures (host + path) — must be exactly the public URL, with `/api`. Its **origin** is also the base of the payment return URL (`/api/payments/return/<id>`) |
| `FINIK_REDIRECT_URL` | `https://t.me/kuttuk_time_bot/app` | the Mini App link our return endpoint 302s to, with `?startapp=order_<uuid>` added (see **Payment RedirectUrl**). Not sent to Finik any more |

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
| `FINIK_*` (7 vars) | set — the app doesn't start without them; payments run on prod |

> `TG_BOT_USERNAME` and `TG_APP_NAME` were removed — the URL is hardcoded in the slug-redirect middleware in `src/main.ts`

---

## Known gaps (not urgent)

- **Orphaned Cloudinary uploads:** `POST /upload` doesn't track files in the DB — if a photo is uploaded but never attached to a merchant (form abandoned, save failed, replaced before saving), it stays in Cloudinary forever, nothing cleans it up. Not worth fixing at current scale (storage is cheap, ~8 merchants). If it becomes an issue: a daily cron job comparing Cloudinary's `kuttuk-time/` folder against all `merchant.logo` URLs currently in use, deleting anything unreferenced.

---

## TODOs

### Before launch

- [ ] **Remove the TEMP 10 KGS test nominal before launch** (added 2026-10-17 to test payments on prod — no real users yet). While it's there, the public venue list shows `minNominal: 10` ("from 10 som") for any venue that has it. Order matters — **data first, then code**: once 10 is gone from `VALID_NOMINALS`, every venue PATCH that sends the full `nominals` array (the frontend forms always do) is rejected with 400 for a venue that still has 10.
  1. Find them: `SELECT id, name, nominals FROM venues WHERE 10 = ANY(nominals);` — a venue whose nominals are exactly `{10}` needs real nominals first (removing the only one would violate `venues_nominals_not_empty`, and the whole UPDATE fails).
  2. `UPDATE venues SET nominals = array_remove(nominals, 10) WHERE 10 = ANY(nominals);`
  3. Code: remove `10` from `VALID_NOMINALS` (`src/venues/venue.constants.ts`) and delete `test/integration/temp-test-nominal.int-spec.ts`. Nothing to change on the frontend — it reads the list from `GET /api/venues/options`.
  4. Already-paid 10 KGS orders/certificates are history — leave them.
- [ ] **Rotate leaked secrets** — not now (the user's decision; the risk was explained), but before launch: `JWT_SECRET` (weak in any case), the Finik keys, `BOT_TOKEN`, `CLOUDINARY_API_SECRET`, the prod DB password. Rotating `JWT_SECRET` logs everyone out (the frontend re-logs-in on 401, so it's harmless).
- [ ] **Always-on Koyeb instance** — Hobby sleeps without traffic: cold starts, the expiry cron only ticks while awake, and the first request after a sleep is slow. (The one duplicate webhook on prod was *not* caused by this — see **Finik webhook**.)
- [ ] Enable `origin: allowedOrigins` in CORS (currently `origin: true`)
- [ ] Bakai / Freedom not started (real Finik webhooks already verify on prod).

### Later

Ordered by priority. (The admin «Выплаты» and «Заказы» endpoints asked by the frontend are built — 2026-10-21, see **API**.)

- [ ] **QR scanning at redemption** — frontend only (Telegram `qrScanner` fills the same code, no backend change). The rest of the cabinet is done (2026-10-20/21: redemption, summary, paginated list, venues, sale notifications). Undoing a mistaken redemption stays an open question (a manual script if needed).
- [ ] **Staging:** a test bot + Finik beta. Redemption was built without it — the user decided to test on prod (only he uses it; all merchants are test ones). Return to it before launch.
- [ ] **Bot notifications — the rest** (sale, redemption, payout notices and the expiry reminder are built, see **Bot**): a weekly digest on Mondays.
- [ ] **Resolving `needs_review` from the admin** (issue / refund buttons) — after the admin orders list (built 2026-10-21) and the refund decision; today it's the `orders:resolve-review` CLI (see the **needs_review runbook**).
- [ ] **Payouts:** the weekly report, the admin screen and **marking payouts** exist (2026-10-21; `payouts` table, `orders.payoutId`, a bot message to the owner); the transfer itself stays manual until the money-flow decision (**Product decisions**). Next: a Monday reminder/digest, undo of a mistaken mark (today SQL), merchant notification of the weekly sum, and recording what was paid (today nothing marks an order as paid out).
- [ ] **Per-merchant commission rate** — today one `PLATFORM_COMMISSION_PERCENT = 10` for everyone (the risk table already says it may drop to 7–8%). Would need a `merchants.commissionPercent` column (with the rate as of the sale, so past reports don't change).
- [ ] `GET /api/certificates/my` has no pagination — fine at current volume (a buyer has a handful); add cursor pagination (`createdAt`, `id`) before it gets long
- [ ] **Nest 12** — the remaining `npm audit` highs in prod deps (`multer` inside `@nestjs/platform-express`, `js-yaml`/`lodash` via `@nestjs/swagger`) are only fixed by the major upgrade.
- [ ] **Category filter via GIN:** switch `:category = ANY(categories)` to `categories @> ARRAY[:id]` so `venues_categories_idx` is actually used (see **Migrations**).
- [ ] **Public routes are still rate-limited by the Koyeb proxy IP.** Authenticated routes are fixed (2026-10-15): `UserThrottlerGuard` (`src/auth/user-throttler.guard.ts`) keys them as `user:<id>`. Routes without a user — `POST /api/auth/log-in` above all, also `GET /:slug` — still use `req.ip`, which is the proxy hop (no `trust proxy` is set), so everyone behind the same Koyeb node shares one counter per route. Seen on prod 2026-09-30: `X-RateLimit-Remaining` went 59→59→58→58→59 for one client, i.e. different proxy nodes, not one counter per client. Chain: client → Cloudflare → Koyeb → app. **Which header carries the real client IP is NOT verified** — it can only be seen server-side on prod; `CF-Connecting-IP` and `X-Forwarded-For` are likely candidates, but that's an assumption. Full fix: temporarily log `cf-connecting-ip`, `x-forwarded-for`, `x-real-ip` and `req.ip` on prod, check in the Koyeb logs which header holds the client IP and can't be set by the client, use it in `UserThrottlerGuard.getTracker` for the no-user case, remove the log. **Don't** just set `trust proxy: true`: Express would take the leftmost `X-Forwarded-For`, which the client controls, so anyone could bypass the limit by spoofing it (the NestJS docs example with `req.ips[0]` has the same problem). Low urgency: log-in happens once per session; the frequent calls (polling) are authenticated.
