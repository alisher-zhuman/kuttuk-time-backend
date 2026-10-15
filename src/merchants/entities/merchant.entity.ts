import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Check,
} from "typeorm";

import type { Translations } from "@/common/translations";

@Entity("merchants")
// GIN index created by hand on prod (see Baseline migration); TypeORM can't declare GIN,
// so it must not try to manage (drop) it.
@Index("merchants_categories_idx", { synchronize: false })
// Declared here so schema diffs stay clean; TypeORM matches CHECKs by name.
@Check("merchants_description_langs", `"description" ?& ARRAY['ru', 'kg', 'en']`)
@Check("merchants_nominals_not_empty", `cardinality("nominals") > 0`)
export class Merchant {
  @PrimaryGeneratedColumn()
  id!: number;

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
  merchantTelegramId!: number;

  @Column({ type: "text" })
  logo!: string;

  @Column({ type: "text", unique: true })
  slug!: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
