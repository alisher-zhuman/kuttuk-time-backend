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
2. The merchant owner opens the KuttukTime app (merchant role — there's no cashier role, see **Product decisions**)
3. Taps "Mark as used" → the code moves to the used state
4. Customer receives the service ✅

---

## Product decisions

**Decided:**
- **Roles are only `user` / `merchant` / `admin`.** No separate roles (cashier, staff) — the merchant owner redeems certificates.
- **Redemption is all-or-nothing.** No partial redemption.
- **The merchant is paid for the sale, not for the redemption.** If the customer spends more than the nominal, they pay the difference to the merchant directly.

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
- `@/` path alias = `src/`
- **Every route requires a JWT** (global `JwtGuard` + `UserThrottlerGuard` in `app.module.ts`); opt out with `@Public()`. **Guard order matters:** global guards run in registration order, and `JwtGuard` must come first so `req.user` is set when the throttler picks its key (`test/integration/rate-limit.int-spec.ts` fails if the order flips). Side effect: requests with a missing/invalid token get 401 before the throttler and aren't counted
- Admin endpoints live in separate `admin-*.controller.ts` files under `/api/admin/*`, class-level `@UseGuards(RolesGuard) @Roles("admin")`
- `ValidationPipe({ whitelist: true })` without `transform` — unknown body fields are silently stripped (not rejected); query/params stay strings, so use `ParseIntPipe` / `ParseBoolPipe`
- `GlobalExceptionFilter` turns Postgres unique violations into 409 (`<field> "<value>" is already in use`) and logs every 5xx with a stack trace

---

## Database (current entities)

**users** — `id`, `telegramId` (unique, **bigint** — Telegram IDs exceed int4), `role` (user/merchant/admin), `createdAt`

**merchants** — `id`, `name`, `description` (multilingual jsonb `{kg,ru,en}`), `categories[]`, `nominals[]`, `validityMonths` (default 12), `merchantTelegramId` (**bigint**), `logo` (Cloudinary URL), `slug` (unique), `isActive`, `createdAt`, `updatedAt`

**categories** — `id`, `name` (multilingual jsonb `{kg,ru,en}`), `order`

**Multilingual fields are always complete** (since 2026-10-15): `merchants.description` and `merchants.slug` are `NOT NULL`; CHECKs `merchants_description_langs` / `categories_name_langs` (`?& ARRAY['ru','kg','en']`) and `merchants_nominals_not_empty` (`cardinality(nominals) > 0`), declared with `@Check` in the entities so schema diffs stay clean. DTOs validate the same with `@IsTranslations()` (`src/common/validators.ts`: exactly `ru`/`kg`/`en`, non-blank strings, extra keys → 400). PATCH DTOs use `@IsOptionalNotNull()` instead of `@IsOptional()` — a field may be omitted but not `null` (null on a NOT NULL column used to be a 500). `resolveTranslation` therefore always returns a string (unknown language → `kg`); type `Translations` in `src/common/translations.ts`.

**orders** — `id` (uuid, generated in the app, = Finik `PaymentId`), `userId` (FK users), `merchantId` (FK merchants), `amount` (int, KGS), `status` (`pending`/`paid`/`expired`/`needs_review`), `paymentUrl`, `expiresAt`, `paidAt`, `finikTransactionId` (unique), `createdAt`, `updatedAt`. Indexes `(userId, createdAt)`, `(status, expiresAt)`

**certificates** — `id` (uuid), `code` (unique, `KT-XXXX-XXXX`), `orderId` (FK, unique — one order = one certificate), `merchantId`, `ownerUserId`, `amount`, `status` (`active`/`used`/`expired`), `validUntil`, `usedAt` (set ⇔ `used`, CHECK `certificates_used_at_iff_used`), `createdAt`

**finik_webhook_events** — audit of **every** request to the webhook, valid or not: `id`, `receivedAt`, `signatureValid`, `headers` (only `host` + `x-api-*`; the `signature` header itself is not stored), `body`, `result`, `orderId` (nullable, indexed, **no FK** so the audit row can always be written). `headers`/`body` are **`json`, not `jsonb`**: jsonb reorders keys, and nested key order is part of Finik's signature — with `json` a stored body can be re-verified later

All FKs are `ON DELETE RESTRICT` — a user/merchant with orders can't be deleted. New tables use `timestamptz`; the old ones keep `timestamp without time zone`.

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
- **`merchants_categories_idx`** — a GIN index on `merchants.categories`, created by hand on prod. TypeORM can't declare GIN indexes, so the entity marks it `@Index(..., { synchronize: false })` to keep it from being dropped. Note: the code filters with `:category = ANY(categories)`, which GIN doesn't speed up (it would need `categories @> ARRAY[:id]`).

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
- `GET /:slug` — merchant redirect into the TMA (redirects to `t.me/kuttuk_time_bot/app?startapp=:slug`)
- `GET /api/payments/return/:orderId` — where Finik sends the buyer after paying; **302** to the Mini App on that order (see **Payment RedirectUrl**). No JWT, default rate limit by IP, hidden from Swagger
- `GET /api/merchants/options` → `{ nominals: number[], validityMonths: number[] }` from `VALID_NOMINALS` / `VALID_VALIDITY_MONTHS` (`src/merchants/merchant.constants.ts`), sorted ascending. **Rule: the backend is the single source of allowed merchant values** — the frontend doesn't keep its own lists, it reads them from here (the DTOs validate against the same constants). Default rate limit, by IP (public)

**Merchants — public surface (any authenticated role: user/merchant/admin), resolved shape:**
- `GET /api/merchants` — active only, filters `?search=`, `?category=` (id), language via `Accept-Language`
- `GET /api/merchants/:idOrSlug` — by ID or slug, active only (inactive → 404). Static routes (`me`, `options`) are declared before it in the controller, so those words are **reserved slugs** (`RESERVED_SLUGS`, rejected by the create/admin-update DTOs) — a merchant with such a slug would be unreachable here and its `startapp=<slug>` deep link would get the wrong response. Add any new `GET /api/merchants/<word>` to `RESERVED_SLUGS`

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

**Orders (any authenticated role):**
- `POST /api/orders` — body `{ merchantId, nominal }` → 201 `{ orderId, paymentUrl, expiresAt }`. The amount is the nominal, checked against the merchant's **current** `nominals` (client amounts are never trusted). Merchant missing/inactive or nominal not offered → 400. Creates an order `pending` for 30 min, then calls `FinikService.createPayment`. If Finik fails (API/network/timeout) → the order goes `expired` (kept, not deleted: on a timeout Finik may still have created the payment, and a later webhook must find it) and the client gets 502 without Finik details. Rate limit 10/min **per user**
- `GET /api/orders/:id` — for polling after payment. Only the owner; anyone else's order → 404. Non-uuid → 400. Returns `status`, `amount`, `merchantId`, `expiresAt`, `paidAt`, `paymentUrl` (only while `pending`) and `certificate: { code, validUntil }` once `paid`. Rate limit 60/min **per user** (the frontend polls every 3 s = 20/min)

**Certificates (any authenticated role):**
- `GET /api/certificates/my` — the caller's certificates (`ownerUserId` = current user), contract agreed with the frontend (`../frontend/src/entities/certificate/model/schemas.ts`) — **don't change the shape**: `{ id, code, amount, status, validUntil, usedAt?, createdAt, merchant: { id, name, slug, logo } }`. `status` is the **effective** one (see below); `usedAt` key is present **only** for `used` (absent, not null, otherwise). Sorted in SQL: effective `active` first, then newest first (`createdAt DESC`). One query with the merchant joined (`src/certificates/certificates.service.ts`); certificates of deactivated merchants are included. Default rate limit (60/min per user). No pagination yet (see TODOs)

**Statuses:**
- Order: `pending → paid | expired | needs_review`, and `expired → paid | needs_review` (a payment can land after the QR expired — the money is taken, so it's honoured). A cron (`OrdersService.expireStale`, every minute) moves only `pending` with `expiresAt < now` to `expired` — it never touches `paid`/`needs_review`. `paid`/`needs_review` are set only by the Finik webhook. `GET /api/orders/:id` returns `needs_review` as is (no certificate, no payment URL)
- Certificate: `active → used | expired`. **Effective status is computed on read:** `active` in the DB with `validUntil < now()` is returned as `expired` — there's no cron for certificates, so the stored `active` may already be expired. **Redemption ("mark as used", not built yet) must check `validUntil`, not just `status = 'active'`**, and must set `usedAt` together with `status = 'used'` — the frontend parses the whole list with a schema that requires `usedAt` on `used`, so one `used` row without it breaks the user's entire list — the DB enforces it: CHECK `certificates_used_at_iff_used` = `(status = 'used') = ("usedAt" IS NOT NULL)`, i.e. `used` ⇔ `usedAt` set, both ways. Created only by the webhook, in the same transaction that marks the order `paid`. `validUntil = addMonths(paidAt, merchant.validityMonths)` — calendar months in UTC, clamped to the month's last day (Jan 31 + 1 → Feb 28/29; `src/common/utils/add-months.ts`). Code `KT-XXXX-XXXX` from a 32-symbol alphabet without `0/O/1/I`, `crypto.randomInt` (`src/certificates/certificate-code.ts`)

**Finik webhook — `POST /api/finik/webhook`** (`src/orders/finik-webhook.{controller,service}.ts`, signature check in `src/finik/finik-webhook.verifier.ts`). Public (`@Public`), not throttled (`@SkipThrottle`), hidden from Swagger. Answers **200** = "don't retry", **401** = bad signature, **5xx** = Finik retries (up to a day).
- **Signature:** our `finik-signer` + Finik's public key (`FINIK_PUBLIC_KEY_B64`). Host and path come from **`FINIK_WEBHOOK_URL`**, not from the request (behind Koyeb's proxy they differ) — so it must be **exactly** the public URL Finik calls, with `/api`: `https://kuttuk-time.koyeb.app/api/finik/webhook`; anything else and every webhook gets 401. `x-api-*` headers and the query come from the request, the body is the parsed JSON as is (key order preserved), the signature from the lower-case `signature` header. No timestamp-freshness check on purpose: Finik retries for up to 24h and may not re-sign; idempotency protects against replays.
- **Processing** (one transaction, `SELECT … FOR UPDATE` on the order, so concurrent deliveries serialize). The order is `body.fields.paymentId` (= our `order.id`). The `result` written to the audit:
  - `invalid_signature` → 401, logged without the body
  - `order_not_found` — unknown or non-uuid `paymentId` → 200 (retrying is pointless)
  - `ignored_status: <status>` — `body.status` isn't `success`/`succeeded` (case-insensitive) → 200, order untouched
  - `already_paid` / `already_needs_review` — duplicate delivery → 200, no-op
  - `needs_review: amount_mismatch` — `body.amount !== order.amount` → order `needs_review`, `paidAt` + `finikTransactionId` filled, **no certificate**, error log → 200
  - `paid` / `paid_after_expiry` — order `paid`, `paidAt = body.transactionDate` (fallback now), `finikTransactionId = body.id`; certificate issued (owner = buyer). Code collisions retried up to 5× via `INSERT … ON CONFLICT (code) DO NOTHING` (catching the error would abort the transaction)
  - `error: <message>` — anything unexpected → everything rolled back, 500, Finik retries
- **Audit** is written first, outside the payment transaction (`received`, then the final `result`), so it survives a rollback. To re-check a disputed webhook: take `body` + `headers` from `finik_webhook_events` and run them through `FinikWebhookVerifier.verify` with the signature from Finik.

**Resolving `needs_review` by hand** (Finik took money, but not the amount we expected — usually a Finik-side or tampering issue):
1. Find them: `SELECT o.*, e.body FROM orders o JOIN finik_webhook_events e ON e."orderId" = o.id AND e.result LIKE 'needs_review%' WHERE o.status = 'needs_review';` — compare `e.body->>'amount'` with `o.amount` and check `o."finikTransactionId"` in Finik's cabinet.
2. Decide: **refund** through Finik (then leave the order as `needs_review`, or note it), or **honour** it — set the order to `paid` and insert the certificate by hand in one transaction (code from `generateCertificateCode()`, `validUntil` = `paidAt` + the merchant's `validityMonths`). There's no admin endpoint for this yet.
3. A retried webhook for that order is a no-op (`already_needs_review`), so a manual fix is never overwritten.

**Payment RedirectUrl → back to the order.** The chain:
1. `OrdersService` sends Finik `RedirectUrl = <public origin>/api/payments/return/<order.id>` (`paymentReturnUrl`, `src/orders/payment-redirect-url.ts`). The public origin is the origin of **`FINIK_WEBHOOK_URL`** — it already has to be our exact public URL (webhook signatures are checked against its host, and they verify on prod), so no extra env to forget on Koyeb. If the webhook ever moves to another host, the return URL moves with it.
2. After paying, Finik sends the buyer there (through its own `/v1/redirect` hop, possibly appending a query).
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

1. **Orders module** — ✅ orders, certificates issued on payment (webhook); still missing: redemption
2. **Payment integration** — Finik: ✅ payment creation + webhook (not yet tried with a real Finik webhook). Bakai / Freedom: not started
3. **Merchant cabinet** — weekly stats, list of active codes, "mark as used"
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

**What to cover next (riskiest first):** initData HMAC verification (`auth.service`, real fixtures — the `signature` field bit us once); redemption (`active → used`, no double redemption).

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
| `FINIK_*` (7 vars) | **not set yet** — must be added before `dev` is merged to `main`, or prod won't start |

> `TG_BOT_USERNAME` and `TG_APP_NAME` were removed — the URL is hardcoded in the slug-redirect middleware in `src/main.ts`

---

## Known gaps (not urgent)

- **Orphaned Cloudinary uploads:** `POST /upload` doesn't track files in the DB — if a photo is uploaded but never attached to a merchant (form abandoned, save failed, replaced before saving), it stays in Cloudinary forever, nothing cleans it up. Not worth fixing at current scale (storage is cheap, ~8 merchants). If it becomes an issue: a daily cron job comparing Cloudinary's `kuttuk-time/` folder against all `merchant.logo` URLs currently in use, deleting anything unreferenced.

---

## TODOs

### Before launch

- [ ] **Remove the TEMP 10 KGS test nominal before launch** (added 2026-10-17 to test payments on prod — no real users yet). While it's there, the public merchant list shows `minNominal: 10` ("from 10 som") for any merchant that has it. Order matters — **data first, then code**: once 10 is gone from `VALID_NOMINALS`, every merchant PATCH that sends the full `nominals` array (the frontend forms always do) is rejected with 400 for a merchant that still has 10.
  1. Find them: `SELECT id, name, nominals FROM merchants WHERE 10 = ANY(nominals);` — a merchant whose nominals are exactly `{10}` needs real nominals first (removing the only one would violate `merchants_nominals_not_empty`, and the whole UPDATE fails).
  2. `UPDATE merchants SET nominals = array_remove(nominals, 10) WHERE 10 = ANY(nominals);`
  3. Code: remove `10` from `VALID_NOMINALS` (`src/merchants/merchant.constants.ts`) and delete `test/integration/temp-test-nominal.int-spec.ts`. Nothing to change on the frontend — it reads the list from `GET /api/merchants/options` (frontend `0238b0b`).
  4. Already-paid 10 KGS orders/certificates are history — leave them.
- [ ] **Confirm the payment-return fix on prod** (2026-10-20: Finik now gets our `/api/payments/return/<id>` instead of the t.me link — see **Payment RedirectUrl**). After deploy: a 10 KGS test payment, check that it ends on the order screen, and read the `Payment return: …` log line in Koyeb to see what Finik appends. If it still lands in the bot chat, the problem is past our 302 (how Telegram handles a t.me link opened from Finik's page) — then look at an HTML page with a `tg://resolve?domain=kuttuk_time_bot&appname=app&startapp=…` button instead.
- [ ] **Double webhook on prod:** Finik delivered the same webhook again ~28 s later (its first retry), so our first 200 wasn't counted on Finik's side. Idempotency handled it (`already_paid`). Find out why — Koyeb cold start / response time over Finik's timeout? Check the two rows in `finik_webhook_events` (`receivedAt`) against Koyeb logs.
- [ ] **Rotate leaked secrets**, and `JWT_SECRET` in any case — it's weak. Rotating `JWT_SECRET` logs everyone out (the frontend re-logs-in on 401, so it's harmless).
- [ ] Enable `origin: allowedOrigins` in CORS (currently `origin: true`)
- [ ] Set `FINIK_*` on Koyeb, then merge `dev` → `main` (see **Project status**)
- [ ] First real Finik webhook on beta: check it in `finik_webhook_events` (`signatureValid = true`); Bakai/Freedom not started

### Later

- [ ] **Redemption** ("mark as used" by the merchant owner): check `validUntil`, not just `status`; set `usedAt` with `status = 'used'` (CHECK `certificates_used_at_iff_used`); no double redemption — see **Statuses** and **Product decisions**.
- [ ] **Staging before redemption:** a test bot + Finik beta, so redemption and payments can be tried without prod.
- [ ] **Bot notifications** (see **Bot — messages and commands**): the code to the buyer (`requestWriteAccess` at the moment of purchase), new sale and redemption to the merchant, a reminder before a certificate expires.
- [ ] **Merchant cabinet** (stats, active codes, redemption) and **admin for orders** incl. resolving `needs_review` (today it's SQL by hand — see **Resolving `needs_review` by hand**).
- [ ] **Payouts and weekly reports** — depend on the open money-flow decision (**Product decisions**).
- [ ] `GET /api/certificates/my` has no pagination — fine at current volume (a buyer has a handful); add cursor pagination (`createdAt`, `id`) before it gets long
- [ ] **Nest 12** — the remaining `npm audit` highs in prod deps (`multer` inside `@nestjs/platform-express`, `js-yaml`/`lodash` via `@nestjs/swagger`) are only fixed by the major upgrade.
- [ ] **Category filter via GIN:** switch `:category = ANY(categories)` to `categories @> ARRAY[:id]` so `merchants_categories_idx` is actually used (see **Migrations**).
- [ ] **Public routes are still rate-limited by the Koyeb proxy IP.** Authenticated routes are fixed (2026-10-15): `UserThrottlerGuard` (`src/auth/user-throttler.guard.ts`) keys them as `user:<id>`. Routes without a user — `POST /api/auth/log-in` above all, also `GET /:slug` — still use `req.ip`, which is the proxy hop (no `trust proxy` is set), so everyone behind the same Koyeb node shares one counter per route. Seen on prod 2026-09-30: `X-RateLimit-Remaining` went 59→59→58→58→59 for one client, i.e. different proxy nodes, not one counter per client. Chain: client → Cloudflare → Koyeb → app. **Which header carries the real client IP is NOT verified** — it can only be seen server-side on prod; `CF-Connecting-IP` and `X-Forwarded-For` are likely candidates, but that's an assumption. Full fix: temporarily log `cf-connecting-ip`, `x-forwarded-for`, `x-real-ip` and `req.ip` on prod, check in the Koyeb logs which header holds the client IP and can't be set by the client, use it in `UserThrottlerGuard.getTracker` for the no-user case, remove the log. **Don't** just set `trust proxy: true`: Express would take the leftmost `X-Forwarded-For`, which the client controls, so anyone could bypass the limit by spoofing it (the NestJS docs example with `req.ips[0]` has the same problem). Low urgency: log-in happens once per session; the frequent calls (polling) are authenticated.
