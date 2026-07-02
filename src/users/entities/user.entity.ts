import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from "typeorm";

@Entity("users")
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

  @CreateDateColumn()
  createdAt!: Date;
}
