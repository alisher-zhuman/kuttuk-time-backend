import { Entity, PrimaryGeneratedColumn, Column, Check } from "typeorm";

import type { Translations } from "@/common/translations";

@Entity("categories")
@Check("categories_name_langs", `"name" ?& ARRAY['ru', 'kg', 'en']`)
export class Category {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "jsonb" })
  name!: Translations;

  @Column({ default: 0 })
  order!: number;
}
