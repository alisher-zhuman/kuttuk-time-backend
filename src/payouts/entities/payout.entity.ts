import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";

import { Merchant } from "@/merchants/entities/merchant.entity";
import { User } from "@/users/entities/user.entity";

// One money transfer to a merchant, recorded by the admin after paying by hand. The orders it
// covers point back via orders.payoutId — a paid order with no payoutId isn't paid out yet.
// The sums are a snapshot of those orders at the moment of marking (same 90/10 floor rule).
@Entity("payouts")
@Index(["merchantId", "periodFrom"])
@Check("payouts_sums_add_up", `"payout" + "commission" = "gross" AND "ordersCount" > 0`)
@Check("payouts_period_valid", `"periodFrom" <= "periodTo"`)
export class Payout {
  @PrimaryColumn("uuid")
  id!: string;

  @Column()
  merchantId!: number;

  @ManyToOne(() => Merchant, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "merchantId" })
  merchant?: Merchant;

  // The payout week (Mon–Sun, Bishkek), as calendar dates.
  @Column({ type: "date" })
  periodFrom!: string;

  @Column({ type: "date" })
  periodTo!: string;

  @Column("int")
  ordersCount!: number;

  @Column("int")
  gross!: number;

  @Column("int")
  commission!: number;

  @Column("int")
  payout!: number;

  // How / when the money went out, e.g. "Mbank transfer 21.10".
  @Column({ type: "text", nullable: true })
  note!: string | null;

  // The admin who marked it.
  @Column()
  paidBy!: number;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "paidBy" })
  paidByUser?: User;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
