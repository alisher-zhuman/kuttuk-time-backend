import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";

import { Order } from "./order.entity";

export enum OrderResolutionAction {
  Issue = "issue",
  Refunded = "refunded",
}

// The trail of a manual decision on a needs_review order (npm run orders:resolve-review).
// Separate from finik_webhook_events on purpose: that table is Finik's data (every row can be
// re-verified against its signature); this one is ours. Written in the same transaction as the
// status change, so a row exists if and only if the change happened.
@Entity("order_resolutions")
export class OrderResolution {
  @PrimaryColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  orderId!: string;

  @ManyToOne(() => Order, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "orderId" })
  order?: Order;

  @Column({ type: "enum", enum: OrderResolutionAction })
  action!: OrderResolutionAction;

  @Column({ type: "text" })
  fromStatus!: string;

  @Column({ type: "text" })
  toStatus!: string;

  // Issued on --issue, for the record.
  @Column({ type: "text", nullable: true })
  certificateCode!: string | null;

  @Column({ type: "text", nullable: true })
  note!: string | null;

  // Who ran it: the OS user, or --by.
  @Column({ type: "text" })
  resolvedBy!: string;

  @CreateDateColumn({ type: "timestamptz" })
  resolvedAt!: Date;
}
