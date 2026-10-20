import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

// The business account of a venue owner: login role, cabinet, deactivation, payouts.
// The storefront data (name shown to buyers, logo, nominals, slug…) lives on its venues.
@Entity("merchants")
export class Merchant {
  @PrimaryGeneratedColumn()
  id!: number;

  // Business name for the admin and the payout report.
  @Column()
  name!: string;

  // The owner's Telegram account: log-in gives this user the merchant role.
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

  // false: every venue is hidden from buyers and the owner can't edit them;
  // the cabinet and redemption keep working.
  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
