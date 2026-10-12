import { Column, Entity, Index, PrimaryColumn } from "typeorm";

// One row per incoming webhook request, valid or not — for reconciling with Finik.
@Entity("finik_webhook_events")
export class FinikWebhookEvent {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "timestamptz", default: () => "now()" })
  receivedAt!: Date;

  @Column()
  signatureValid!: boolean;

  // Only host and x-api-* headers.
  @Column({ type: "json" })
  headers!: Record<string, string>;

  // json, not jsonb: jsonb reorders keys, and nested key order is part of Finik's signature —
  // with json the stored body can still be re-verified against the original signature.
  @Column({ type: "json" })
  body!: unknown;

  @Column({ type: "text" })
  result!: string;

  // No FK on purpose: the audit row must be writable whatever the payload references.
  @Index()
  @Column({ type: "uuid", nullable: true })
  orderId!: string | null;
}
