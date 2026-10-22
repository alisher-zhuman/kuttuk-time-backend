import { corsOrigins } from "./app.setup";

describe("corsOrigins", () => {
  it("takes ALLOWED_ORIGINS, trimmed, empty entries dropped", () => {
    expect(
      corsOrigins({
        ALLOWED_ORIGINS: " http://localhost:5173 , https://kuttuk-time.vercel.app,,",
        NODE_ENV: "production",
      }),
    ).toEqual(["http://localhost:5173", "https://kuttuk-time.vercel.app"]);
  });

  it("unset: the local dev server outside production, nothing in production", () => {
    expect(corsOrigins({ NODE_ENV: "development" })).toEqual(["http://localhost:5173"]);
    expect(corsOrigins({ ALLOWED_ORIGINS: " , ", NODE_ENV: "production" })).toEqual([]);
  });
});
