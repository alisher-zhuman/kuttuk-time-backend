import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { Certificate } from "./certificate.entity";

@Entity("merchants")
export class Merchant {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ type: "varchar", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", nullable: true })
  phone!: string | null;

  @Column({ unique: true })
  ownerTelegramId!: number;

  @Column({ default: true })
  isActive!: boolean;

  @OneToMany(() => Certificate, (cert) => cert.merchant, { cascade: true })
  certificates!: Certificate[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
