import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Check } from "typeorm";

import type { Language } from "@/common/translations";

@Entity("users")
@Check("users_language_valid", `"language" IN ('ru', 'kg', 'en')`)
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: "bigint",
    unique: true,
    // Telegram IDs exceed int4 (>2.1B). Stored as bigint; transformer keeps
    // it a JS number (safe - Telegram IDs are well below 2^53).
    transformer: {
      to: (value: number) => value,
      from: (value: string | null) => (value == null ? value : Number(value)),
    },
  })
  telegramId!: number;

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
