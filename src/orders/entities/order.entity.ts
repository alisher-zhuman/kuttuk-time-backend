import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { User } from "@/users/entities/user.entity";
import { Merchant } from "@/merchants/entities/merchant.entity";
import { Venue } from "@/venues/entities/venue.entity";
import { Payout } from "@/payouts/entities/payout.entity";

export enum OrderStatus {
  Pending = "pending",
  Paid = "paid",
  Expired = "expired",
  // Paid, but the amount didn't match — no certificate; resolve by hand.
  NeedsReview = "needs_review",
  // Terminal: a needs_review order whose money was returned outside the system (resolved by hand).
  Refunded = "refunded",
}

@Entity("orders")
// Only a paid order can be paid out to the merchant.
@Check("orders_payout_only_paid", `"payoutId" IS NULL OR "status" = 'paid'`)
@Index(["userId", "createdAt"])
@Index(["status", "expiresAt"])
// Payouts and the cabinet summary (by the sale-time owner and paidAt), the admin list.
@Index(["merchantId", "paidAt"])
@Index(["createdAt", "id"])
export class Order {
  // Generated in the app (randomUUID) so it can be sent to Finik as PaymentId.
  @PrimaryColumn("uuid")
  id!: string;

  @Column()
  userId!: number;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "userId" })
  user?: User;

  @Column()
  venueId!: number;

  @ManyToOne(() => Venue, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "venueId" })
  venue?: Venue;

  // The venue's owner at the moment of the sale: payouts go to whoever sold, so moving a
  // venue to another merchant later doesn't rewrite past payout reports.
  @Column()
  merchantId!: number;

  @ManyToOne(() => Merchant, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "merchantId" })
  merchant?: Merchant;

  @Column("int")
  amount!: number;

  // The payout that covered this order (paid orders only); null = not paid out yet.
  @Column({ type: "uuid", nullable: true })
  payoutId!: string | null;

  @ManyToOne(() => Payout, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "payoutId" })
  payout?: Payout;

  @Column({ type: "enum", enum: OrderStatus, default: OrderStatus.Pending })
  status!: OrderStatus;

  @Column({ type: "text", nullable: true })
  paymentUrl!: string | null;

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  paidAt!: Date | null;

  @Column({ type: "text", nullable: true, unique: true })
  finikTransactionId!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
