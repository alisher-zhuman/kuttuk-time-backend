// The website for buyers (docs/web-version.md) - the same frontend outside Telegram. WEBSITE_URL
// once there's an own domain; until then the Mini App's URL (MINI_APP_URL, on Vercel) - the same
// app. null = not configured: website-only features (the web payment return, gift links) are off.
export const websiteUrl = (): string | null => {
  const url = (process.env.WEBSITE_URL ?? process.env.MINI_APP_URL)?.trim();

  return url ? url.replace(/\/+$/, "") : null;
};
