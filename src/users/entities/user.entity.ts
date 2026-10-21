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
    // it a JS number (safe — Telegram IDs are well below 2^53).
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

  // The app language last seen from this user (log-in, purchase) — for bot messages.
  // null until known; messages then fall back to kg, like the rest of the app.
  @Column({ type: "text", nullable: true })
  language!: Language | null;

  @CreateDateColumn()
  createdAt!: Date;
}
