import {
  CertificateStatus,
  type Certificate,
} from "../../src/certificates/entities/certificate.entity";
import { ExpiryRemindersService } from "../../src/certificates/expiry-reminders.service";
import { OrderStatus } from "../../src/orders/entities/order.entity";
import type { User } from "../../src/users/entities/user.entity";
import type { Venue } from "../../src/venues/entities/venue.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { createCertificate, createOrder, createUser, createVenue } from "../helpers/factories";

const DAY = 24 * 60 * 60 * 1000;
// 12:00 in Bishkek — inside the daytime window.
const NOON = new Date("2026-10-21T06:00:00Z");

describe("expiry reminders (integration)", () => {
  let t: TestApp;
  let buyer: User;
  let venue: Venue;
  let n = 0;

  const reminders = () => t.app.get(ExpiryRemindersService);

  const certificate = async (validUntil: Date, fields: Partial<Certificate> = {}) => {
    const order = await createOrder(t.ds, {
      userId: buyer.id,
      venueId: venue.id,
      status: OrderStatus.Paid,
      paidAt: new Date(),
    });

    n++;

    return createCertificate(t.ds, {
      orderId: order.id,
      venueId: venue.id,
      ownerUserId: buyer.id,
      amount: 500,
      code: `KT-AAAA-${"BCDEFGHJKLMN"[n % 12].repeat(4)}`,
      validUntil,
      ...fields,
    });
  };

  const remindedAt = async (id: string) =>
    (await t.ds.query(`SELECT "expiryRemindedAt" FROM certificates WHERE id = $1`, [id]))[0]
      .expiryRemindedAt;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    buyer = await createUser(t.ds, { language: "ru" });
    venue = await createVenue(t.ds, { name: "Coffeeroom" });
  });

  afterAll(async () => {
    await t?.close();
  });

  it("≤ 7 days left → one message to the owner, marked; the next run sends nothing", async () => {
    const soon = await certificate(new Date(NOON.getTime() + 6 * DAY));

    expect(await reminders().run(NOON)).toBe(1);
    expect(t.bot.sent).toHaveLength(1);
    expect(t.bot.sent[0]).toMatchObject({
      chatId: buyer.telegramId,
      html: `⏳ Сертификат <code>${soon.code}</code> в <b>Coffeeroom</b> на 500 сом действует до 27.10.2026.\n\nНе забудьте воспользоваться.`,
      button: {
        text: "Открыть сертификат",
        url: `https://t.me/kuttuk_time_bot/app?startapp=order_${soon.orderId}`,
      },
    });
    expect(await remindedAt(soon.id)).toEqual(NOON);

    expect(await reminders().run(new Date(NOON.getTime() + 60 * 60 * 1000))).toBe(0);
    expect(t.bot.sent).toHaveLength(1);
  });

  it("skips: more than 7 days left, already expired, used, stored expired", async () => {
    await certificate(new Date(NOON.getTime() + 8 * DAY));
    await certificate(new Date(NOON.getTime() - DAY));
    await certificate(new Date(NOON.getTime() + DAY), {
      status: CertificateStatus.Used,
      usedAt: new Date(),
    });
    await certificate(new Date(NOON.getTime() + DAY), { status: CertificateStatus.Expired });

    expect(await reminders().run(NOON)).toBe(0);
    expect(t.bot.sent).toHaveLength(0);
  });

  it.each([
    ["08:59", "2026-10-21T02:59:00Z"],
    ["21:00", "2026-10-21T15:00:00Z"],
    ["03:00", "2026-10-20T21:00:00Z"],
  ])(
    "sends nothing at night (%s Bishkek), the reminder waits for the morning",
    async (_label, at) => {
      const soon = await certificate(new Date(NOON.getTime() + 3 * DAY));

      expect(await reminders().run(new Date(at))).toBe(0);
      expect(await remindedAt(soon.id)).toBeNull();
      expect(await reminders().run(NOON)).toBe(1);
    },
  );

  it("two overlapping runs remind once", async () => {
    await certificate(new Date(NOON.getTime() + 2 * DAY));
    await certificate(new Date(NOON.getTime() + 3 * DAY));

    const [a, b] = await Promise.all([reminders().run(NOON), reminders().run(NOON)]);

    expect(a + b).toBe(2);
    expect(t.bot.sent).toHaveLength(2);
  });

  it("a refused message (403) still counts as reminded — no retries", async () => {
    const soon = await certificate(new Date(NOON.getTime() + DAY));

    t.bot.deliver = false;

    expect(await reminders().run(NOON)).toBe(1);
    expect(await remindedAt(soon.id)).not.toBeNull();
    expect(await reminders().run(NOON)).toBe(0);
  });

  it("unknown language → kg", async () => {
    await t.ds.query(`UPDATE users SET language = NULL WHERE id = $1`, [buyer.id]);
    await certificate(new Date(NOON.getTime() + DAY));

    await reminders().run(NOON);

    expect(t.bot.sent[0].html).toContain("чейин жарактуу");
    expect(t.bot.sent[0].button?.text).toBe("Сертификатты ачуу");
  });
});
