import { generateKeyPairSync } from "node:crypto";
import { Signer } from "@mancho.devs/authorizer";
import type { RequestData } from "@mancho.devs/authorizer/types";

import { buildCanonicalString, sign, verify, type FinikRequest } from "./finik-signer";

const FINIK_BETA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwlrlKz/8gLWd1ARWGA/8
o3a3Qy8G+hPifyqiPosiTY6nCHovANMIJXk6DH4qAqqZeLu8pLGxudkPbv8dSyG7
F9PZEAryMPzjoB/9P/F6g0W46K/FHDtwTM3YIVvstbEbL19m8yddv/xCT9JPPJTb
LsSTVZq5zCqvKzpupwlGS3Q3oPyLAYe+ZUn4Bx2J1WQrBu3b08fNaR3E8pAkCK27
JqFnP0eFfa817VCtyVKcFHb5ij/D0eUP519Qr/pgn+gsoG63W4pPHN/pKwQUUiAy
uLSHqL5S2yu1dffyMcMVi9E/Q2HCTcez5OvOllgOtkNYHSv9pnrMRuws3u87+hNT
ZwIDAQAB
-----END PUBLIC KEY-----`;

const FINIK_DOC_SIGNATURE =
  "jS1a8HW4BTIea8iCmoW/EF7FXUA0JSsHe/kSRBfCYdxFwvyrMe0SOfU9pAKzOOO0bIsa9FW+WqAzqxExHjcscmG8k/vwgB+dCMcM04K91vTL6eZAVOE/Hcx2iALNZnG6UVnP/jnUt8MjK+xwBhamwFktxdUovf+cVFZ2io10RAT1pOEIHtZceXbQeg7XlhcPuTAKmOuF1B4gGoksRtGglGwwyvYaa9ml8OPMP3uoCaauYqT0aUKLTNsJdFfO0Q3Dvsy9uyWvuVa5t6adbIm+SHlbz9VGSZ2xrwgETUBVj86dfA3oiAgERLKhQTBSMTxRYlUKhPVHGfR3kjAhD3g4JQ==";

const finikDocRequest = (): FinikRequest => ({
  httpMethod: "POST",
  path: "/finik-callback",
  queryStringParameters: null,
  headers: {
    "Content-Type": "application/json",
    Host: "huntpro.kg",
    "x-api-timestamp": "1781763261255",
  },
  body: {
    fields: {
      amount: 1,
      webhook_url: "https://huntpro.kg/finik-callback",
      paymentId: "141fc797-0366-480e-8ba7-2982632b2b2c",
      success_redirect_url:
        "https://api.acquiring.averspay.kg/v1/redirect?paymentId=141fc797-0366-480e-8ba7-2982632b2b2c&clientId=1295102413&status=succeeded",
      name: "HuntPro",
      qrTransactionId: "aaa76e79-f808-4ac5-b88e-76a9b4055832",
    },
    amount: 1,
    transactionDate: 1781697937466,
    clientId: "25c1aabe-fc4a-4968-85d9-90600466e9a5",
    id: "320259584_aaa76e79-f808-4ac5-b88e-76a9b4055832_DEBIT",
    status: "succeeded",
    transactionId: "141fc797-0366-480e-8ba7-2982632b2b2c",
    data: {
      accountId: "8d4e1d11-e50c-4278-a5e2-4e55de196c6a",
      description: "Order 2606",
      webhookUrl: "https://huntpro.kg/finik-callback",
      name_en: "HuntPro",
    },
  },
});

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const withBody = (req: FinikRequest, body: Record<string, unknown>): FinikRequest => ({
  ...req,
  body,
});

describe("Finik doc test vector", () => {
  // The doc signature was not produced by the published beta key: raw RSA decryption with it
  // yields random bytes (no PKCS#1 v1.5 `0001ff..` / PSS `..bc` structure), so no canonical form
  // can verify. The library itself returns false too. Re-enable once Finik sends a matching pair.
  it.skip("verifies the doc signature with the beta public key", () => {
    expect(verify(finikDocRequest(), FINIK_DOC_SIGNATURE, FINIK_BETA_PUBLIC_KEY)).toBe(true);
  });

  it("builds the expected canonical string", () => {
    expect(buildCanonicalString(finikDocRequest())).toBe(
      [
        "post",
        "/finik-callback",
        "host:huntpro.kg&x-api-timestamp:1781763261255",
        JSON.stringify({
          amount: 1,
          clientId: "25c1aabe-fc4a-4968-85d9-90600466e9a5",
          data: finikDocRequest().body!.data,
          fields: finikDocRequest().body!.fields,
          id: "320259584_aaa76e79-f808-4ac5-b88e-76a9b4055832_DEBIT",
          status: "succeeded",
          transactionDate: 1781697937466,
          transactionId: "141fc797-0366-480e-8ba7-2982632b2b2c",
        }),
      ].join("\n"),
    );
  });
});

describe("verify", () => {
  const req = finikDocRequest();
  const signature = sign(req, privateKey);

  it("accepts a valid signature", () => {
    expect(verify(req, signature, publicKey)).toBe(true);
  });

  it.each(Object.keys(req.body!))("rejects when top-level body field %s changes", (key) => {
    const tampered = withBody(req, { ...req.body, [key]: "tampered" });

    expect(verify(tampered, signature, publicKey)).toBe(false);
  });

  it.each(["amount", "paymentId", "webhook_url"])(
    "rejects when nested fields.%s changes",
    (key) => {
      const fields = req.body!.fields as Record<string, unknown>;
      const tampered = withBody(req, { ...req.body, fields: { ...fields, [key]: "tampered" } });

      expect(verify(tampered, signature, publicKey)).toBe(false);
    },
  );

  it("rejects amount 1 vs '1' (type matters)", () => {
    expect(verify(withBody(req, { ...req.body, amount: "1" }), signature, publicKey)).toBe(false);
  });

  it("rejects when x-api-timestamp, path or method changes", () => {
    expect(
      verify({ ...req, headers: { ...req.headers, "x-api-timestamp": "1" } }, signature, publicKey),
    ).toBe(false);
    expect(verify({ ...req, path: "/other" }, signature, publicKey)).toBe(false);
    expect(verify({ ...req, httpMethod: "PUT" }, signature, publicKey)).toBe(false);
  });

  it("finds Host case-insensitively (Express lowercases header names)", () => {
    const { Host, ...rest } = req.headers;

    expect(verify({ ...req, headers: { ...rest, host: Host } }, signature, publicKey)).toBe(true);
  });

  it.each([
    ["empty signature", ""],
    ["non-base64 signature", "not base64!!"],
    ["truncated signature", signature.slice(0, 20)],
  ])("returns false on %s", (_name, sig) => {
    expect(verify(req, sig, publicKey)).toBe(false);
  });

  it("returns false (no throw) on garbage key, missing Host, malformed path, non-string signature", () => {
    expect(verify(req, signature, "garbage")).toBe(false);
    expect(verify({ ...req, headers: {} }, signature, publicKey)).toBe(false);
    expect(verify({ ...req, path: "/%E0%A4%A" }, signature, publicKey)).toBe(false);
    expect(verify(req, null as unknown as string, publicKey)).toBe(false);
  });

  it("does not verify with another key", () => {
    expect(verify(req, signature, FINIK_BETA_PUBLIC_KEY)).toBe(false);
  });
});

describe("parity with @mancho.devs/authorizer", () => {
  beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  const libraryCanonical = (req: FinikRequest): string =>
    (new Signer(req as RequestData) as unknown as { getData(): string }).getData();

  const cases: Array<[string, FinikRequest]> = [
    ["finik doc webhook", finikDocRequest()],
    [
      "GET with query, no body",
      {
        httpMethod: "GET",
        path: "/v1/payment/abc",
        headers: {
          Host: "beta.api.acquiring.averspay.kg",
          "x-api-key": "k",
          "x-api-timestamp": "1700000000000",
        },
        queryStringParameters: { status: "succeeded", page: "2", limit: "10" },
        body: null,
      },
    ],
    [
      "query needing encoding + encoded path",
      {
        httpMethod: "get",
        path: "/v1/search/%D0%BA%D0%BE%D1%84%D0%B5",
        headers: { Host: "example.kg", "X-Api-Timestamp": "1", "x-api-key": "k" },
        queryStringParameters: {
          q: "кофе с молоком",
          "a b": "x y",
          empty: undefined,
          enc: "%20already",
        },
        body: null,
      },
    ],
    [
      "POST with nested body and arrays",
      {
        httpMethod: "POST",
        path: "/v1/payment",
        headers: {
          Host: "beta.api.acquiring.averspay.kg",
          "x-api-key": "k",
          "x-api-timestamp": "2",
          "Content-Type": "x",
        },
        queryStringParameters: {},
        body: {
          Amount: 1000,
          CardType: "FINIK_QR",
          PaymentId: "5e1c1f5b-0a3c-4c1b-9a59-2a1d7c8a3f10",
          RedirectUrl: "https://kuttuk-time.vercel.app/paid",
          Data: {
            accountId: "acc",
            merchantCategoryCode: "0742",
            name_en: "KuttukTime",
            description: "Сертификат 1000 сом",
            items: [{ z: 1, a: [3, 2, 1] }, null, true, 0.1],
          },
        },
      },
    ],
    [
      "body keys that differ between localeCompare and code-point sort",
      {
        httpMethod: "PATCH",
        path: "/x",
        headers: { Host: "h" },
        queryStringParameters: null,
        body: { b: 1, B: 2, a_b: 3, aB: 4, ab: 5, _x: 6, Z: 7, "10": 8, "2": 9, é: 10, e: 11 },
      },
    ],
    [
      "numbers, unicode and special values",
      {
        httpMethod: "DELETE",
        path: "/",
        headers: { Host: "h", "x-api-b": "2", "X-API-A": "1", "x-api-c": "3" },
        queryStringParameters: { z: "", a: "1" },
        body: {
          float: 1.5,
          big: 12345678901234,
          neg: -0,
          exp: 1e21,
          str: '"quoted" \n  😀',
          nil: null,
        },
      },
    ],
    [
      "empty body object",
      {
        httpMethod: "POST",
        path: "/e",
        headers: { Host: "h" },
        queryStringParameters: null,
        body: {},
      },
    ],
  ];

  it.each(cases)("%s: canonical string matches", (_name, req) => {
    expect(buildCanonicalString(req)).toBe(libraryCanonical(req));
  });

  it.each(cases)("%s: signatures match and cross-verify", async (_name, req) => {
    const ours = sign(req, privateKey);
    const theirs = await new Signer(req as RequestData).sign(privateKey);

    expect(ours).toBe(theirs);
    expect(verify(req, theirs, publicKey)).toBe(true);
    await expect(new Signer(req as RequestData).verify(publicKey, ours)).resolves.toBe(true);
  });
});
