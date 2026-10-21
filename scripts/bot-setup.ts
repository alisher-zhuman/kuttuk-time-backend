// One-time bot setup (re-run after changing the texts, the URL or BOT_TOKEN):
//   npm run bot:setup -- --dry-run     # print what would be sent, call nothing
//   npm run bot:setup                  # apply
// Reads BOT_TOKEN, FINIK_WEBHOOK_URL (its origin = our public URL) and MINI_APP_URL from the env.
// Calls the Bot API with the real token: setWebhook (our /api/telegram/webhook + the secret),
// the profile description / short description per language, the default menu button.
import { parseArgs } from "node:util";

import { LANGUAGES, type Language } from "../src/common/translations";
import { botProfile, menuButtonText } from "../src/telegram/bot-texts";
import { botWebhookSecret } from "../src/telegram/bot-webhook-secret";

const API = "https://api.telegram.org";
// Telegram's language codes: Kyrgyz is "ky". "" = the default for every other language.
const TELEGRAM_CODE: Record<Language, string> = { ru: "ru", en: "en", kg: "ky" };
const DEFAULT_LANGUAGE: Language = "ru";

const required = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
};

const main = async () => {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
  const dryRun = values["dry-run"] === true;
  const token = required("BOT_TOKEN");
  const webhookUrl = `${new URL(required("FINIK_WEBHOOK_URL")).origin}/api/telegram/webhook`;
  const miniAppUrl = required("MINI_APP_URL");

  const calls: Array<[string, Record<string, unknown>]> = [
    [
      "setWebhook",
      {
        url: webhookUrl,
        secret_token: botWebhookSecret(token),
        allowed_updates: ["message"],
        drop_pending_updates: true,
      },
    ],
    ...[
      ...LANGUAGES.map((lang) => [lang, TELEGRAM_CODE[lang]] as const),
      [DEFAULT_LANGUAGE, ""] as const,
    ].flatMap(
      ([lang, code]): Array<[string, Record<string, unknown>]> => [
        ["setMyDescription", { description: botProfile[lang].description, language_code: code }],
        [
          "setMyShortDescription",
          { short_description: botProfile[lang].shortDescription, language_code: code },
        ],
      ],
    ),
    [
      "setChatMenuButton",
      {
        menu_button: {
          type: "web_app",
          text: menuButtonText(DEFAULT_LANGUAGE),
          web_app: { url: miniAppUrl },
        },
      },
    ],
  ];

  for (const [method, payload] of calls) {
    // Never print the secret.
    const shown = {
      ...payload,
      ...("secret_token" in payload ? { secret_token: "<derived from BOT_TOKEN>" } : {}),
    };

    if (dryRun) {
      process.stdout.write(`${method} ${JSON.stringify(shown)}\n`);
      continue;
    }

    const response = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };

    process.stdout.write(
      `${result.ok ? "✓" : "✗"} ${method} ${JSON.stringify(shown).slice(0, 120)}${result.ok ? "" : ` — ${response.status} ${result.description ?? ""}`}\n`,
    );

    if (!result.ok) {
      process.exitCode = 1;
    }
  }

  if (!dryRun) {
    const info = (await (await fetch(`${API}/bot${token}/getWebhookInfo`)).json()) as {
      result?: { url?: string; pending_update_count?: number; last_error_message?: string };
    };

    process.stdout.write(
      `\nwebhook: ${info.result?.url ?? "-"}, pending ${info.result?.pending_update_count ?? "-"}${info.result?.last_error_message ? `, last error: ${info.result.last_error_message}` : ""}\n`,
    );
  }
};

main().catch((error: unknown) => {
  // Only the message — a fetch error could otherwise carry the URL with the token.
  process.stderr.write(
    `bot:setup failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
