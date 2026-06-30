# KuttukTime Backend — Контекст для Claude

## Проект

**KuttukTime** — Telegram Mini App (TMA) для быстрой покупки и отправки подарочных сертификатов от локальных бизнесов Кыргызстана (кофейни, спа, рестораны, салоны красоты).

**Главная идея:** пользователь за 30 секунд покупает сертификат и отправляет в подарок. Регистрация и номер телефона не нужны — всё через Telegram.

**Production:** `https://kuttuk-time.koyeb.app` (Koyeb, Frankfurt, Free tier)
**CI/CD:** push в `main` → автоматический редеплой

---

## Бизнес-модель

**Комиссия 10%** с каждой продажи.

```
Пользователь платит:  1000 сом
Платёжная система:      -20 сом (2%)
Мерчанту выплата:      -900 сом (90%)
Наш доход:              +80 сом (~8% чистыми)
```

**Выплаты мерчантам:** каждый понедельник автоматически через Finik / Bakai / Freedom.

**Прогноз:**
| Период | Мерчантов | Заказов/нед | Доход/месяц |
|--------|-----------|-------------|-------------|
| Месяц 1-2 | 2 | 20-50 | 2 000–3 000 сом |
| Месяц 3-4 | 5-10 | 100-200 | 15 000–30 000 сом |
| Месяц 6+ | 20-50 | 500+ | 75 000+ сом |

**Точка беспокойства:** < 10 заказов/неделю  
**Точка успеха:** > 50 заказов/неделю после первого месяца

---

## Flow для пользователя

```
1. Открыл KuttukTime в Telegram
2. Выбрал мерчанта (Кофе Ali, Спа Вишня, Ресторан Мараба...)
3. Выбрал номинал (500, 1000, 2000 сом...)
4. Оплатил → получил код → поделился в Telegram
```

## Flow для мерчанта

**Подключение:** получает специальную ссылку → открыл в Telegram → система запомнила его как владельца.

**Использование сертификата:**
1. Клиент приходит, показывает код (напр. `KT-ALI-5847`)
2. Кассир открывает приложение KuttukTime
3. Жмёт "Отметить использованным" → код переходит в использованные
4. Клиент получил услугу ✅

---

## Стек

- **NestJS 10** + TypeScript + Express
- **PostgreSQL** через TypeORM 0.3
- **Passport JWT** — аутентификация через Telegram initData (HMAC-SHA256)
- **Cloudinary** — хранение изображений (авто-конвертация в WebP)
- **Swagger** — автодока на `/api`
- **Throttler** — 60 запросов / 60 сек глобально

---

## База данных (текущие сущности)

**users** — `id`, `telegramId` (unique), `role` (user/merchant/admin), `createdAt`

**merchants** — `id`, `name`, `description` (jsonb мультиязычный `{kg,ru,en}`), `categories[]`, `nominals[]`, `validityMonths` (default 12), `merchantTelegramId`, `logo` (Cloudinary URL), `slug` (unique), `isActive`, `createdAt`, `updatedAt`

**categories** — `id`, `name` (unique), `order`

---

## Роли

| Роль | Кто | Права |
|------|-----|-------|
| `user` | покупатель | browse merchants, покупка |
| `merchant` | владелец бизнеса | редактировать свой профиль, видеть свои заказы |
| `admin` | Alisher (владелец системы) | полный доступ ко всему |

**Авто-логика:** при логине — если `telegramId` совпадает с активным мерчантом, роль автоматически становится `merchant`.

---

## API (что уже готово)

**Публичные (без JWT):**
- `POST /api/auth/log-in` — вход через Telegram initData → JWT
- `GET /:slug` — редирект мерчанта в TMA

**Требуют JWT:**
- `GET /api/merchants` — список (фильтр `?search=`, `?category=`, язык через `Accept-Language`)
- `GET /api/merchants/:idOrSlug` — по ID или slug
- `POST /api/merchants` — создать (admin)
- `PATCH /api/merchants/:id` — обновить (admin любого; merchant только своего; slug только admin)
- `GET /api/categories` — список (сортировка по `order`)
- `POST /api/categories` — создать (admin)
- `PATCH /api/categories/:id` — обновить (admin)
- `DELETE /api/categories/:id` — удалить (admin)
- `POST /api/upload` — загрузить изображение (любой авторизованный, max 5MB)

---

## Что ещё нужно сделать (MVP)

Главное что не реализовано:

1. **Orders module** — сертификаты: генерация кодов (`KT-XXX-NNNN`), статусы (active/used/expired), привязка к мерчанту и покупателю
2. **Payment integration** — Finik / Bakai / Freedom (покупка сертификата)
3. **Merchant cabinet** — статистика за неделю, список активных кодов, отметка "использован"
4. **Weekly reports** — автоматический расчёт и уведомление мерчанту каждый понедельник

---

## Дизайн

UI финализирован: фиолетовый `#8B5CF6` / розовый `#EC4899`, light/dark темы.

---

## Платформы

| Слой | Роль |
|------|------|
| Telegram Mini App | Основной продукт, конверсия |
| Website | SEO + доверие + витрина (долгосрочно) |
| Instagram/TikTok | Acquisition через ссылки мерчантов |

**Персональные ссылки мерчантов (будущее):**
```
t.me/bot/app?startapp=coffeehouse_ali
yourapp.com/m/coffeehouse?ref=insta_ali
```

---

## Риски

| Риск | Решение |
|------|---------|
| Платёжка упала | 3 провайдера: Finik, Bakai, Freedom |
| Мерчанты против 10% | Можно снизить до 7-8% если нужно |
| Клиент оспаривает покупку | На старте решаем вручную |
| Конкуренция (Giftery) | Локальнее, быстрее, на Telegram |

---

## Правила работы с Claude

- **Alisher = frontend dev (React/TS)** — backend объяснять на простом языке
- Один модуль за раз — следующий шаг только после явного "го"
- Сначала объяснение на русском, потом код
- Тесты и подробный Swagger — после MVP
- Не добавлять лишней абстракции — пишем минимально необходимое

---

## ENV переменные

### Dev (`.env`)

| Переменная | Пример | Примечание |
|---|---|---|
| `DATABASE_HOST` | `localhost` | |
| `DATABASE_PORT` | `5432` | |
| `DATABASE_USER` | `postgres` | |
| `DATABASE_PASSWORD` | `postgres` | |
| `DATABASE_NAME` | `kuttuktime` | |
| `DATABASE_SSL` | `false` | `true` на Koyeb |
| `DB_SYNC` | `true` | **только dev**, на проде `false` |
| `JWT_SECRET` | `...` | длинная случайная строка |
| `JWT_EXPIRATION` | `24h` | |
| `BOT_TOKEN` | `...` | от @BotFather, для верификации initData |
| `CLOUDINARY_CLOUD_NAME` | `...` | |
| `CLOUDINARY_API_KEY` | `...` | |
| `CLOUDINARY_API_SECRET` | `...` | |
| `PORT` | `3000` | на Koyeb `8000` |
| `NODE_ENV` | `development` | `production` на проде |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | на проде добавить vercel URL |

### Prod (Koyeb) — актуальный список

| Переменная | Примечание |
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

> `TG_BOT_USERNAME` и `TG_APP_NAME` удалены — URL захардкожен в redirect.controller.ts

---

## Важные TODO перед продом

- [ ] Включить `origin: allowedOrigins` в CORS (сейчас `origin: true`)
- [ ] Добавить оплату (Finik/Bakai/Freedom)
