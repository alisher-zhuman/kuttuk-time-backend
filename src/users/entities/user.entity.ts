import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Check } from "typeorm";

import type { Language } from "@/common/translations";

@Entity("users")
@Check("users_language_valid", `"language" IN ('ru', 'kg', 'en')`)
// A user is either a Telegram account or a website guest (since 2026-11-11), never both or
// neither; a guest is always a plain buyer.
@Check("users_telegram_or_guest", `("telegramId" IS NULL) <> ("guestTokenHash" IS NULL)`)
@Check("users_guest_is_buyer", `"telegramId" IS NOT NULL OR "role" = 'user'`)
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  // null = a website guest (docs/web-version.md) - no bot messages until they log in with
  // Telegram, which moves their purchases to the Telegram account.
  @Column({
    type: "bigint",
    unique: true,
    nullable: true,
    // Telegram IDs exceed int4 (>2.1B). Stored as bigint; transformer keeps
    // it a JS number (safe - Telegram IDs are well below 2^53).
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => (value == null ? value : Number(value)),
    },
  })
  telegramId!: number | null;

  // A website guest: sha256 of the secret the browser keeps (POST /api/auth/guest). Only the
  // hash is stored - a database read never hands out a working guest login.
  @Column({ type: "text", unique: true, nullable: true })
  guestTokenHash!: string | null;

  @Column({
    type: "enum",
    enum: ["user", "merchant", "admin"],
    default: "user",
  })
  role!: "user" | "merchant" | "admin";

  // The app language last seen from this user (log-in, purchase) - for bot messages.
  // null until known; messages then fall back to kg, like the rest of the app.
  @Column({ type: "text", nullable: true })
  language!: Language | null;

  // The first name from Telegram (initData, refreshed at every log-in) - «Подарок от Айбека» on
  // the gift screen. null if Telegram sent none.
  @Column({ type: "text", nullable: true })
  firstName!: string | null;

  // Last log-in to the Mini App (admin: "is the owner connected").
  @Column({ type: "timestamptz", nullable: true })
  lastSeenAt!: Date | null;

  // Did the last bot message reach them: true - delivered, false - Telegram refused (blocked
  // the bot / never allowed it), null - nothing sent yet. Set by TelegramBotService.send.
  @Column({ type: "boolean", nullable: true })
  botReachable!: boolean | null;

  @CreateDateColumn()
  createdAt!: Date;
}
