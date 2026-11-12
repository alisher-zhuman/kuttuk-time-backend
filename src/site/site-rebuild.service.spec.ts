import { ConfigService } from "@nestjs/config";

import { SITE_REBUILD_DELAY_MS, SiteRebuildService } from "./site-rebuild.service";

const HOOK = "https://api.vercel.com/v1/integrations/deploy/prj_test/secret";

describe("SiteRebuildService", () => {
  let fetchMock: jest.Mock;

  const service = (url?: string) =>
    new SiteRebuildService({ get: () => url } as unknown as ConfigService);

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("several changes in a row → one rebuild, after the delay since the last one", async () => {
    const s = service(HOOK);

    s.request("venue 1");
    await jest.advanceTimersByTimeAsync(SITE_REBUILD_DELAY_MS - 1000);
    s.request("venue 2");
    await jest.advanceTimersByTimeAsync(SITE_REBUILD_DELAY_MS - 1000);

    expect(fetchMock).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(HOOK, expect.objectContaining({ method: "POST" }));
  });

  it("no hook configured → nothing is called", async () => {
    const s = service(undefined);

    s.request("venue 1");
    await jest.advanceTimersByTimeAsync(SITE_REBUILD_DELAY_MS * 2);
    await s.onModuleDestroy();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a pending rebuild is sent at shutdown; none pending → nothing", async () => {
    const s = service(HOOK);

    await s.onModuleDestroy();
    expect(fetchMock).not.toHaveBeenCalled();

    s.request("venue 1");
    await s.onModuleDestroy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(SITE_REBUILD_DELAY_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a failed call never throws", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const s = service(HOOK);

    s.request("venue 1");

    await expect(s.flush()).resolves.toBeUndefined();
  });
});
