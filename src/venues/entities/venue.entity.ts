import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import type { Translations } from "@/common/translations";
import { Merchant } from "@/merchants/entities/merchant.entity";

// A storefront the buyer sees and buys from. Owned by a merchant (the business account);
// one merchant can own several venues (a chain), payouts are per merchant.
@Entity("venues")
// GIN index created by hand on prod (see Baseline migration); TypeORM can't declare GIN,
// so it must not try to manage (drop) it.
@Index("venues_categories_idx", { synchronize: false })
// A merchant's venues (cabinet, admin, redemption scope).
@Index(["merchantId"])
// Declared here so schema diffs stay clean; TypeORM matches CHECKs by name.
@Check("venues_description_langs", `"description" ?& ARRAY['ru', 'kg', 'en']`)
@Check("venues_nominals_not_empty", `cardinality("nominals") > 0`)
export class Venue {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  merchantId!: number;

  @ManyToOne(() => Merchant, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "merchantId" })
  merchant?: Merchant;

  @Column()
  name!: string;

  @Column({ type: "jsonb" })
  description!: Translations;

  @Column("int", { array: true })
  categories!: number[];

  @Column("int", { array: true })
  nominals!: number[];

  @Column({ default: 12 })
  validityMonths!: number;

  @Column({ type: "text" })
  logo!: string;

  @Column({ type: "text", unique: true })
  slug!: string;

  // Hides this one venue. merchant.isActive = false hides all of the merchant's venues.
  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
