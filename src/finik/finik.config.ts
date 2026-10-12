import { registerAs } from "@nestjs/config";

export interface FinikConfig {
  baseUrl: string;
  apiKey: string;
  accountId: string;
  privateKey: string;
  publicKey: string;
  webhookUrl: string;
  redirectUrl: string;
}

const required = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Finik config: env variable ${name} is missing or empty`);
  }

  return value;
};

const pemFromBase64 = (name: string): string => {
  const pem = Buffer.from(required(name), "base64").toString("utf8").trim();

  if (!pem.startsWith("-----BEGIN ") || !pem.includes("-----END ")) {
    throw new Error(`Finik config: ${name} does not decode to a PEM key`);
  }

  return pem;
};

export const finikConfig = registerAs(
  "finik",
  (): FinikConfig => ({
    baseUrl: required("FINIK_BASE_URL").replace(/\/+$/, ""),
    apiKey: required("FINIK_API_KEY"),
    accountId: required("FINIK_ACCOUNT_ID"),
    privateKey: pemFromBase64("FINIK_PRIVATE_KEY_B64"),
    publicKey: pemFromBase64("FINIK_PUBLIC_KEY_B64"),
    webhookUrl: required("FINIK_WEBHOOK_URL"),
    redirectUrl: required("FINIK_REDIRECT_URL"),
  }),
);
