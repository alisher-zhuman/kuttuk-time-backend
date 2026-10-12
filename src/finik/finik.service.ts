import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";

import { finikConfig } from "./finik.config";
import { FinikApiError, FinikNetworkError, FinikTimeoutError } from "./finik.errors";
import { sign } from "./finik-signer";

// Finik docs disagree between /v1/payment and /payment — waiting for their answer.
export const FINIK_PAYMENT_PATH = "/v1/payment";
export const FINIK_TIMEOUT_MS = 15_000;

export interface CreatePaymentInput {
  paymentId: string;
  amount: number;
  nameEn: string;
  description?: string;
  lang?: "ky" | "ru" | "en";
  endDate?: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303]);
const URL_FIELDS = ["paymentUrl", "PaymentUrl", "url", "Url"];

@Injectable()
export class FinikService {
  private readonly logger = new Logger(FinikService.name);

  constructor(
    @Inject(finikConfig.KEY)
    private readonly config: ConfigType<typeof finikConfig>,
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<{ paymentUrl: string }> {
    validate(input);

    const url = new URL(`${this.config.baseUrl}${FINIK_PAYMENT_PATH}`);
    const body = this.buildBody(input);
    const timestamp = String(Date.now());

    const signature = sign(
      {
        httpMethod: "POST",
        path: url.pathname,
        headers: { Host: url.host, "x-api-key": this.config.apiKey, "x-api-timestamp": timestamp },
        queryStringParameters: null,
        body,
      },
      this.config.privateKey,
    );

    const startedAt = Date.now();
    const elapsed = () => Date.now() - startedAt;

    let response: Response;

    try {
      // `host` isn't set here: fetch always derives it from the URL, which is what we signed.
      response = await fetch(url, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(FINIK_TIMEOUT_MS),
        headers: {
          "content-type": "application/json",
          "x-api-key": this.config.apiKey,
          "x-api-timestamp": timestamp,
          signature,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw this.transportError(error, input.paymentId, elapsed());
    }

    const log = `createPayment paymentId=${input.paymentId} status=${response.status}`;

    try {
      const paymentUrl = await this.extractPaymentUrl(response, url);

      this.logger.log(`${log} durationMs=${elapsed()}`);

      return { paymentUrl };
    } catch (error) {
      if (error instanceof FinikApiError) {
        this.logger.warn(`${log} durationMs=${elapsed()} error="${error.message}"`);

        throw error;
      }

      throw this.transportError(error, input.paymentId, elapsed());
    }
  }

  private buildBody(input: CreatePaymentInput): Record<string, unknown> {
    const data: Record<string, unknown> = {
      accountId: this.config.accountId,
      name_en: input.nameEn,
      webhookUrl: this.config.webhookUrl,
    };

    if (input.description !== undefined) {
      data.description = input.description;
    }

    if (input.endDate !== undefined) {
      data.endDate = input.endDate;
    }

    const body: Record<string, unknown> = {
      Amount: input.amount,
      CardType: "FINIK_QR",
      PaymentId: input.paymentId,
      RedirectUrl: this.config.redirectUrl,
    };

    if (input.lang !== undefined) {
      body.Lang = input.lang;
    }

    body.Data = data;

    return body;
  }

  private async extractPaymentUrl(response: Response, requestUrl: URL): Promise<string> {
    const { status } = response;

    if (REDIRECT_STATUSES.has(status)) {
      const location = response.headers.get("location");

      if (!location) {
        throw new FinikApiError(status, "Redirect without Location header");
      }

      return new URL(location, requestUrl).toString();
    }

    const text = await response.text();
    const json = parseJson(text);

    if (status >= 200 && status < 300) {
      const found = URL_FIELDS.map((key) => json?.[key]).find(
        (value): value is string => typeof value === "string" && /^https?:\/\//.test(value),
      );

      if (!found) {
        throw new FinikApiError(status, "Success response without a payment URL");
      }

      return found;
    }

    const message = json?.ErrorMessage ?? json?.errorMessage ?? json?.message;
    const code = json?.StatusCode ?? json?.statusCode;

    throw new FinikApiError(
      status,
      typeof message === "string" && message ? message : `HTTP ${status}: ${text.slice(0, 200)}`,
      typeof code === "number" ? code : undefined,
    );
  }

  private transportError(error: unknown, paymentId: string, durationMs: number): Error {
    // Checked by name, not instanceof: DOMException may come from another realm (e.g. Jest's vm).
    const name = (error as { name?: unknown } | null)?.name;
    const message = (error as { message?: unknown } | null)?.message;
    const result =
      name === "TimeoutError"
        ? new FinikTimeoutError(FINIK_TIMEOUT_MS)
        : new FinikNetworkError(
            `Finik request failed: ${typeof message === "string" ? message : String(error)}`,
            { cause: error },
          );

    this.logger.error(
      `createPayment paymentId=${paymentId} durationMs=${durationMs} error="${result.message}"`,
    );

    return result;
  }
}

const validate = (input: CreatePaymentInput): void => {
  if (!input.paymentId || input.paymentId.length > 36) {
    throw new Error("Finik: paymentId must be 1-36 characters");
  }

  const { amount } = input;

  if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) / 100 !== amount) {
    throw new Error("Finik: amount must be a positive number with at most 2 decimal places");
  }

  if (!input.nameEn) {
    throw new Error("Finik: nameEn is required");
  }
};

const parseJson = (text: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(text);

    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};
