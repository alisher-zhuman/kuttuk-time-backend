import { Inject, Injectable } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";

import { finikConfig } from "./finik.config";
import { verify } from "./finik-signer";

export interface IncomingWebhook {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body: unknown;
}

const isApiHeader = (name: string) => name.toLowerCase().startsWith("x-api-");

const firstValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

@Injectable()
export class FinikWebhookVerifier {
  private readonly host: string;
  private readonly path: string;

  constructor(@Inject(finikConfig.KEY) private readonly config: ConfigType<typeof finikConfig>) {
    // Finik signs the public URL it calls; behind Koyeb's proxy req.host/req.path can differ.
    const url = new URL(config.webhookUrl);

    this.host = url.host;
    this.path = url.pathname;
  }

  verify(webhook: IncomingWebhook): boolean {
    const signature = firstValue(webhook.headers.signature);

    if (!signature) {
      return false;
    }

    const apiHeaders = Object.fromEntries(
      Object.entries(webhook.headers)
        .filter(([name]) => isApiHeader(name))
        .map(([name, value]) => [name, firstValue(value)]),
    );

    const query = Object.fromEntries(
      Object.entries(webhook.query).map(([key, value]) => [key, String(value)]),
    );

    const body =
      webhook.body && typeof webhook.body === "object" && !Array.isArray(webhook.body)
        ? (webhook.body as Record<string, unknown>)
        : null;

    return verify(
      {
        httpMethod: "POST",
        path: this.path,
        headers: { ...apiHeaders, Host: this.host },
        queryStringParameters: Object.keys(query).length ? query : null,
        body,
      },
      signature,
      this.config.publicKey,
    );
  }

  // What the audit keeps: the (public) host Finik signed plus the x-api-* headers it sent.
  auditHeaders(headers: IncomingWebhook["headers"]): Record<string, string> {
    const kept: Record<string, string> = {};
    const host = firstValue(headers.host);

    if (host) {
      kept.host = host;
    }

    for (const [name, value] of Object.entries(headers)) {
      const first = firstValue(value);

      if (isApiHeader(name) && first !== undefined) {
        kept[name] = first;
      }
    }

    return kept;
  }
}
