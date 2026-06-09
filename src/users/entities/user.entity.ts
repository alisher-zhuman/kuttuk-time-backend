import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from "typeorm";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  telegramId!: number;

  @Column({
    type: "enum",
    enum: ["user", "merchant", "admin"],
    default: "user",
  })
  role!: "user" | "merchant" | "admin";

  @CreateDateColumn()
  createdAt!: Date;
}
