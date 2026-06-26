import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("categories")
export class Category {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: string;

  @Column({ default: 0 })
  order!: number;
}
