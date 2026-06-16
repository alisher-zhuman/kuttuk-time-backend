import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Merchant } from "./merchant.entity";

@Entity("certificates")
export class Certificate {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ type: "varchar", nullable: true })
  description!: string | null;

  @Column("int")
  price!: number;

  @Column({ default: true })
  isActive!: boolean;

  @ManyToOne(() => Merchant, (merchant) => merchant.certificates, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "merchantId" })
  merchant!: Merchant;

  @Column()
  merchantId!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
