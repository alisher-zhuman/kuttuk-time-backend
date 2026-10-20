import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
} from "typeorm";

import { User } from "@/users/entities/user.entity";
import { Order } from "@/orders/entities/order.entity";
import { Venue } from "@/venues/entities/venue.entity";

export enum CertificateStatus {
  Active = "active",
  Used = "used",
  Expired = "expired",
}

@Entity("certificates")
// used ⇔ usedAt is set. The frontend parses GET /certificates/my with a schema that requires
// usedAt on used, so a used row without it would break the whole list.
@Check("certificates_used_at_iff_used", `("status" = 'used') = ("usedAt" IS NOT NULL)`)
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

  // No owner snapshot here: a certificate is redeemed by whoever owns the venue now.
  @Column()
  venueId!: number;

  @ManyToOne(() => Venue, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "venueId" })
  venue?: Venue;

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
