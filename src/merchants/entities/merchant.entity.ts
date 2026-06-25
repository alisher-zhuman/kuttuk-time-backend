import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("merchants")
export class Merchant {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ type: "jsonb", nullable: true })
  description!: Record<string, string> | null;

  @Column("text", { array: true })
  categories!: string[];

  @Column("int", { array: true })
  nominals!: number[];

  @Column({ default: 12 })
  validityMonths!: number;

  @Column({ unique: true })
  merchantTelegramId!: number;

  @Column({ type: "text", nullable: true })
  logo!: string | null;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
