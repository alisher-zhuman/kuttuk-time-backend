import { generateKeyPairSync } from "node:crypto";
import { Logger } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";

import type { finikConfig } from "./finik.config";
import { FinikApiError, FinikNetworkError, FinikTimeoutError } from "./finik.errors";
import { FINIK_PAYMENT_PATH, FinikService, type CreatePaymentInput } from "./finik.service";
import { verify } from "./finik-signer";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const config: ConfigType<typeof finikConfig> = {
  baseUrl: "https://beta.api.acquiring.averspay.kg",
  apiKey: "test-api-key",
  accountId: "test-account-id",
  privateKey,
  publicKey: "unused",
  webhookUrl: "https://kuttuk-time.koyeb.app/api/finik/webhook",
  redirectUrl: "https://kuttuk-time.vercel.app/paid",
};

const input: CreatePaymentInput = {
  paymentId: "5e1c1f5b-0a3c-4c1b-9a59-2a1d7c8a3f10",
  amount: 1000,
  nameEn: "KuttukTime",
};

const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("FinikService.createPayment", () => {
  let service: FinikService;
  let fetchMock: jest.SpyInstance;

  const sent = () => {
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];

    return {
      url: new URL(url),
      init,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string) as Record<string, unknown>,
    };
  };

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    service = new FinikService(config);
    fetchMock = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("returns Location of a 302 as paymentUrl", async () => {
    fetchMock.mockResolvedValue(redirect("https://pay.finik.kg/qr/abc"));

    await expect(service.createPayment(input)).resolves.toEqual({
      paymentUrl: "https://pay.finik.kg/qr/abc",
    });
  });

  it.each([301, 303])("accepts %i redirects too", async (status) => {
    fetchMock.mockResolvedValue(redirect("https://pay.finik.kg/qr/abc", status));

    await expect(service.createPayment(input)).resolves.toEqual({
      paymentUrl: "https://pay.finik.kg/qr/abc",
    });
  });

  it("sends POST to baseUrl + payment path with manual redirect and a timeout signal", async () => {
    fetchMock.mockResolvedValue(redirect("https://pay.finik.kg/qr/abc"));

    await service.createPayment(input);

    const { url, init, headers } = sent();

    expect(url.toString()).toBe(`${config.baseUrl}${FINIK_PAYMENT_PATH}`);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(Object.keys(headers).sort()).toEqual([
      "content-type",
      "signature",
      "x-api-key",
      "x-api-timestamp",
    ]);
    expect(headers["x-api-key"]).toBe(config.apiKey);
    expect(headers["x-api-timestamp"]).toMatch(/^\d{13}$/);
  });

  it("builds the body from input + config and omits undefined fields", async () => {
    fetchMock.mockResolvedValue(redirect("https://pay.finik.kg/qr/abc"));

    await service.createPayment(input);

    expect(sent().body).toEqual({
      Amount: 1000,
      CardType: "FINIK_QR",
      PaymentId: input.paymentId,
      RedirectUrl: config.redirectUrl,
      Data: { accountId: config.accountId, name_en: "KuttukTime", webhookUrl: config.webhookUrl },
    });
  });

  it("includes optional fields when given", async () => {
    fetchMock.mockResolvedValue(redirect("https://pay.finik.kg/qr/abc"));

    await service.createPayment({
      ...input,
      description: "Cert 1000",
      lang: "ky",
      endDate: 1781697937466,
    });

    const { body } = sent();

    expect(body.Lang).toBe("ky");
    expect(body.Data).toMatchObject({ description: "Cert 1000", endDate: 1781697937466 });
  });

  it("sends a signature that verifies with the key pair and the baseUrl host", async () => {
    fetchMock.mockResolvedValue(redirect("https://pay.finik.kg/qr/abc"));

    await service.createPayment({ ...input, description: "Сертификат", lang: "ru" });

    const { url, headers, body } = sent();
    const signed = (host: string) => ({
      httpMethod: "POST",
      path: url.pathname,
      headers: {
        Host: host,
        "x-api-key": headers["x-api-key"],
        "x-api-timestamp": headers["x-api-timestamp"],
      },
      queryStringParameters: null,
      body,
    });

    expect(verify(signed(new URL(config.baseUrl).host), headers.signature, publicKey)).toBe(true);
    expect(verify(signed("api.acquiring.averspay.kg"), headers.signature, publicKey)).toBe(false);
  });

  it("takes the URL from a 2xx JSON body", async () => {
    fetchMock.mockResolvedValue(json(201, { paymentUrl: "https://pay.finik.kg/qr/json" }));

    await expect(service.createPayment(input)).resolves.toEqual({
      paymentUrl: "https://pay.finik.kg/qr/json",
    });
  });

  it("fails on a 2xx without a URL", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));

    await expect(service.createPayment(input)).rejects.toThrow(FinikApiError);
  });

  it("fails on a redirect without Location", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302 }));

    await expect(service.createPayment(input)).rejects.toMatchObject({
      name: "FinikApiError",
      status: 302,
    });
  });

  it("parses a 400 with StatusCode/ErrorMessage into FinikApiError", async () => {
    fetchMock.mockResolvedValue(json(400, { StatusCode: 400, ErrorMessage: "Amount is invalid" }));

    const error = await service.createPayment(input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FinikApiError);
    expect(error).toMatchObject({
      status: 400,
      message: "Amount is invalid",
      finikStatusCode: 400,
    });
  });

  it("maps a 401 (lower-case keys) to FinikApiError", async () => {
    fetchMock.mockResolvedValue(json(401, { statusCode: 401, message: "Unauthorized" }));

    await expect(service.createPayment(input)).rejects.toMatchObject({
      name: "FinikApiError",
      status: 401,
      message: "Unauthorized",
      finikStatusCode: 401,
    });
  });

  it("falls back to raw text for a non-JSON error", async () => {
    fetchMock.mockResolvedValue(new Response("Bad Gateway", { status: 502 }));

    await expect(service.createPayment(input)).rejects.toMatchObject({
      status: 502,
      message: "HTTP 502: Bad Gateway",
    });
  });

  it("maps a timeout to FinikTimeoutError", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));

    await expect(service.createPayment(input)).rejects.toThrow(FinikTimeoutError);
  });

  it("maps a network failure to FinikNetworkError", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(service.createPayment(input)).rejects.toThrow(FinikNetworkError);
  });

  it.each([0, -1, 1.005, NaN, Infinity])(
    "rejects amount %p without calling Finik",
    async (amount) => {
      await expect(service.createPayment({ ...input, amount })).rejects.toThrow(/amount/);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([1, 0.01, 19.99, 1000.5])("accepts amount %p", async (amount) => {
    fetchMock.mockResolvedValue(redirect("https://pay.finik.kg/qr/abc"));

    await expect(service.createPayment({ ...input, amount })).resolves.toBeDefined();
  });

  it.each([["x".repeat(37)], [""]])("rejects paymentId of length %#", async (paymentId) => {
    await expect(service.createPayment({ ...input, paymentId })).rejects.toThrow(/paymentId/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never logs secrets, the signature or the body", async () => {
    Logger.overrideLogger(["log", "warn", "error"]);

    const spies = (["log", "warn", "error"] as const).map((level) =>
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
    );

    fetchMock.mockResolvedValueOnce(redirect("https://pay.finik.kg/qr/abc"));
    await service.createPayment(input);
    fetchMock.mockResolvedValueOnce(json(400, { ErrorMessage: "bad" }));
    await service.createPayment(input).catch(() => undefined);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await service.createPayment(input).catch(() => undefined);

    const logged = spies.flatMap((spy) => spy.mock.calls.flat().map(String)).join("\n");
    const { headers } = sent();

    expect(logged).toContain(`paymentId=${input.paymentId}`);
    expect(logged).toMatch(/durationMs=\d+/);
    for (const secret of [
      config.apiKey,
      headers.signature,
      config.accountId,
      "PRIVATE KEY",
      "FINIK_QR",
    ]) {
      expect(logged).not.toContain(secret);
    }

    spies.forEach((spy) => spy.mockRestore());
    Logger.overrideLogger(false);
  });
});
