import { constants, sign as rsaSign, verify as rsaVerify } from "node:crypto";

export interface FinikRequest {
  httpMethod: string;
  path: string;
  headers: Record<string, string | string[] | number | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: Record<string, unknown> | null;
}

// Byte-for-byte port of @mancho.devs/authorizer Signer.getData() (v2.12.8),
// except Host is looked up case-insensitively (Express lowercases header names).
export const buildCanonicalString = (req: FinikRequest): string => {
  const parts = [req.httpMethod.toLowerCase(), decodeURI(req.path ?? ""), headersPart(req.headers)];

  const query = queryPart(req.queryStringParameters);

  if (query) {
    parts.push(query);
  }

  parts.push(bodyPart(req.body));

  return parts.join("\n");
};

const headersPart = (headers: FinikRequest["headers"]): string => {
  const hostKey =
    "Host" in headers ? "Host" : Object.keys(headers).find((k) => k.toLowerCase() === "host");
  const host = hostKey ? headers[hostKey] : undefined;

  if (!host) {
    throw new Error("Header 'Host' is required");
  }

  // Sorted by the original key (case-sensitive), lowercased only on output — same as the library.
  const apiHeaders = Object.keys(headers)
    .filter((key) => key.toLowerCase().startsWith("x-api-"))
    .sort()
    .map((key) => {
      const value = headers[key];

      if (value === undefined || value === null) {
        throw new Error(`Header '${key}' contains invalid value`);
      }

      return `${key.toLowerCase()}:${String(value)}`;
    });

  return [`host:${String(host)}`, ...apiHeaders].join("&");
};

const queryPart = (query: FinikRequest["queryStringParameters"]): string => {
  const params = query ?? {};

  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURI(decodeURI(key))}=${encodeURI(decodeURI(params[key] ?? ""))}`)
    .join("&");
};

// Only top-level keys are sorted (localeCompare); nested objects keep their insertion order.
const bodyPart = (body: FinikRequest["body"]): string => {
  if (!body) {
    return "";
  }

  const sorted = Object.entries(body)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .reduce<Record<string, unknown>>((result, [key, value]) => {
      result[key] = value;

      return result;
    }, {});

  return JSON.stringify(sorted);
};

export const sign = (req: FinikRequest, privateKeyPem: string): string =>
  rsaSign("sha256", Buffer.from(buildCanonicalString(req), "utf8"), {
    key: privateKeyPem,
    padding: constants.RSA_PKCS1_PADDING,
  }).toString("base64");

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export const verify = (req: FinikRequest, signatureB64: string, publicKeyPem: string): boolean => {
  try {
    if (typeof signatureB64 !== "string" || !BASE64.test(signatureB64)) {
      return false;
    }

    return rsaVerify(
      "sha256",
      Buffer.from(buildCanonicalString(req), "utf8"),
      { key: publicKeyPem, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(signatureB64, "base64"),
    );
  } catch {
    return false;
  }
};
