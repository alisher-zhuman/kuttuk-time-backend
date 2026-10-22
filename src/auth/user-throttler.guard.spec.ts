import { throttleKey } from "./user-throttler.guard";

describe("throttleKey", () => {
  const proxy = "::ffff:10.250.0.20";

  it("a logged-in user counts against their own key, whatever the IP", () => {
    expect(
      throttleKey({ user: { userId: 7 }, ip: proxy, headers: { "cf-connecting-ip": "1.2.3.4" } }),
    ).toBe("user:7");
  });

  it("anyone else counts against Cloudflare's client IP (v4 and v6)", () => {
    expect(throttleKey({ ip: proxy, headers: { "cf-connecting-ip": "77.95.59.58" } })).toBe(
      "ip:77.95.59.58",
    );
    expect(throttleKey({ ip: proxy, headers: { "cf-connecting-ip": " 2a00:1450::1 " } })).toBe(
      "ip:2a00:1450::1",
    );
  });

  it("ignores the headers a client controls, and a CF-Connecting-IP that isn't an IP", () => {
    for (const headers of [
      { "x-forwarded-for": "1.2.3.4, 77.95.59.58" },
      { "true-client-ip": "8.8.8.8" },
      { forwarded: "for=7.7.7.7" },
      { "cf-connecting-ip": "not-an-ip" },
      { "cf-connecting-ip": ["1.2.3.4", "5.6.7.8"] },
    ]) {
      expect(throttleKey({ ip: proxy, headers })).toBe(proxy);
    }
  });
});
