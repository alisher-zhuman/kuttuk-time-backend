# KuttukTime Backend

REST API for KuttukTime — a gift certificate platform for local businesses in Kyrgyzstan. Built as a Telegram Mini App (TMA) where users buy and send gift certificates in under 30 seconds.

## Tech Stack

- **NestJS** — framework
- **TypeORM** — ORM
- **PostgreSQL** — database
- **JWT** — authentication
- **Cloudinary** — image storage
- **Koyeb** — deployment

## Local Setup

```bash
# 1. Clone and install
git clone https://github.com/alisher-zhuman/kuttuk-time-backend.git
cd kuttuk-time-backend
npm install

# 2. Create .env file
cp .env.example .env
# Fill in the variables (see below)

# 3. Start dev server
npm run start:dev
```

### Environment Variables

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=kuttuk_time
DB_SYNC=true
DATABASE_SSL=false

JWT_SECRET=your_jwt_secret
BOT_TOKEN=your_telegram_bot_token

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

ALLOWED_ORIGINS=http://localhost:5173
```

## Scripts

```bash
npm run start:dev   # development with hot reload
npm run build       # production build
npm run start:prod  # run production build
npm run typecheck   # TypeScript type check
npm run lint        # ESLint check
```

## API Endpoints

All endpoints require a Bearer JWT token except where noted.

### Auth

| Method | URL | Access | Description |
|--------|-----|--------|-------------|
| POST | `/api/auth/login` | Public | Login via Telegram initData, returns JWT |

**Login body:**
```json
{ "initData": "user=...&hash=..." }
```

### Merchants

| Method | URL | Access | Description |
|--------|-----|--------|-------------|
| GET | `/api/merchants` | Any | List active merchants (supports `?search=` and `?category=`) |
| GET | `/api/merchants/:id` | Any | Get one merchant |
| POST | `/api/merchants` | Admin | Create merchant |
| PATCH | `/api/merchants/:id` | Admin / Merchant | Update merchant |

### Categories

| Method | URL | Access | Description |
|--------|-----|--------|-------------|
| GET | `/api/categories` | Any | List all categories sorted by order |
| POST | `/api/categories` | Admin | Create category |
| PATCH | `/api/categories/:id` | Admin | Update category name or order |
| DELETE | `/api/categories/:id` | Admin | Delete category |

### Upload

| Method | URL | Access | Description |
|--------|-----|--------|-------------|
| POST | `/api/upload` | Any | Upload image (any format, max 5MB), converted to WebP by Cloudinary |

## Roles

- `user` — default role, can browse merchants
- `merchant` — auto-assigned when telegramId matches an active merchant record
- `admin` — set manually in the database

## Swagger

API docs available at `/api` when running locally.

## Deployment

The app is deployed on [Koyeb](https://koyeb.com). Environment variables are configured in the Koyeb dashboard — never committed to the repository.

To deploy: push to the `main` branch.
