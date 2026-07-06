import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("categories")
export class Category {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "jsonb" })
  name!: Record<string, string>;

  @Column({ default: 0 })
  order!: number;
}
