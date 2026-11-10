import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";

import { Certificate } from "./certificate.entity";
import { User } from "@/users/entities/user.entity";

// «Подарить» → «Забрать подарок»: one row per gift link. The owner shares a card with a link
// (startapp=gift_<token>); whoever opens it first and taps "Забрать" becomes the certificate's
// owner. Only the token's sha256 is stored. A new share deletes the owner's link that nobody
// claimed yet, so at most one open link per certificate (the partial unique index). Claimed rows
// stay - the trail of who gave it to whom (A → B → C), and what the giver's list shows as «Подарен».
@Entity("certificate_gifts")
@Index("certificate_gifts_one_open", ["certificateId"], {
  unique: true,
  where: `"claimedAt" IS NULL`,
})
@Index(["fromUserId"])
@Check("certificate_gifts_claimed_together", `("claimedAt" IS NULL) = ("claimedByUserId" IS NULL)`)
export class CertificateGift {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  certificateId!: string;

  @ManyToOne(() => Certificate, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "certificateId" })
  certificate?: Certificate;

  // The owner when the link was made - the one who gives it.
  @Column()
  fromUserId!: number;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "fromUserId" })
  fromUser?: User;

  @Column({ type: "text", unique: true })
  tokenHash!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  claimedAt!: Date | null;

  @Column({ type: "int", nullable: true })
  claimedByUserId!: number | null;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "claimedByUserId" })
  claimedBy?: User;
}
