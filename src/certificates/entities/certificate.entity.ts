import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
} from "typeorm";

import { User } from "@/users/entities/user.entity";
import { Merchant } from "@/merchants/entities/merchant.entity";
import { Order } from "@/orders/entities/order.entity";

export enum CertificateStatus {
  Active = "active",
  Used = "used",
  Expired = "expired",
}

@Entity("certificates")
export class Certificate {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "text", unique: true })
  code!: string;

  // Unique via the @OneToOne join column below; an explicit `unique` would add a duplicate index.
  @Column({ type: "uuid" })
  orderId!: string;

  @OneToOne(() => Order, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "orderId" })
  order?: Order;

  @Column()
  merchantId!: number;

  @ManyToOne(() => Merchant, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "merchantId" })
  merchant?: Merchant;

  @Column()
  ownerUserId!: number;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "ownerUserId" })
  owner?: User;

  @Column("int")
  amount!: number;

  @Column({ type: "enum", enum: CertificateStatus, default: CertificateStatus.Active })
  status!: CertificateStatus;

  @Column({ type: "timestamptz" })
  validUntil!: Date;

  @Column({ type: "timestamptz", nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
