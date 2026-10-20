import {
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
@Index(["userId", "createdAt"])
@Index(["status", "expiresAt"])
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
  merchantId!: number;

  @ManyToOne(() => Merchant, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "merchantId" })
  merchant?: Merchant;

  @Column("int")
  amount!: number;

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
