# KuttukTime Backend

REST API for KuttukTime — a gift certificate platform for local businesses in Kyrgyzstan. Built as a Telegram Mini App (TMA) where users buy and send gift certificates in under 30 seconds.

## Tech Stack

- **NestJS** — framework
- **TypeORM** — ORM
- **PostgreSQL** — database
- **JWT** — authentication
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

### Auth

| Method | URL | Access | Description |
|--------|-----|--------|-------------|
| POST | `/auth/login` | Public | Login by Telegram ID, returns JWT |

**Login body:**
```json
{ "telegramId": 123456789 }
```

### Merchants

| Method | URL | Access | Description |
|--------|-----|--------|-------------|
| GET | `/merchants` | Public | List all active merchants |
| GET | `/merchants/:id` | Public | Get merchant with certificates |
| POST | `/merchants` | Admin | Create merchant |
| PATCH | `/merchants/:id` | Admin / Owner | Update merchant |

### Certificates

| Method | URL | Access | Description |
|--------|-----|--------|-------------|
| GET | `/merchants/:id/certificates` | Public | List active certificates |
| POST | `/merchants/:id/certificates` | Admin / Owner | Create certificate |
| PATCH | `/merchants/:id/certificates/:certId` | Admin / Owner | Update certificate |

## Roles

- `user` — default role, can browse and buy certificates
- `merchant` — assigned automatically when telegramId matches a merchant record
- `admin` — set manually in the database

## Deployment

The app is deployed on [Koyeb](https://koyeb.com). Environment variables are configured in the Koyeb dashboard — never committed to the repository.

To deploy: push to the `main` branch.
