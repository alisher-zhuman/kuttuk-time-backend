import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

// Periodic bot messages already sent, one row per kind and period — claimed before sending,
// so a restart or two overlapping runs never send the same digest twice.
@Entity("bot_digests")
@Unique("bot_digests_kind_period", ["kind", "periodFrom"])
export class BotDigest {
  @PrimaryGeneratedColumn()
  id!: number;

  // e.g. "admin_payouts" — the Monday "time to pay out" reminder.
  @Column({ type: "text" })
  kind!: string;

  // The period it was about (for admin_payouts: the Monday of the week paid out).
  @Column({ type: "date" })
  periodFrom!: string;

  @CreateDateColumn({ type: "timestamptz" })
  sentAt!: Date;
}
