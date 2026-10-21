import { OrderStatus } from "../../src/orders/entities/order.entity";
import { markPaidOut } from "../../src/payouts/payout-ledger";
import { PayoutReminderService } from "../../src/payouts/payout-reminder.service";
import type { User } from "../../src/users/entities/user.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { createMerchant, createOrder, createUser, createVenue } from "../helpers/factories";

const bishkek = (local: string) => new Date(`${local}+06:00`);
// Monday 2026-10-26 → reminds about the week 19–25.10.
const MONDAY_10 = bishkek("2026-10-26T10:00:00");
const WEEK = { from: "2026-10-19", to: "2026-10-25" };

describe("Monday payout reminder to the admin (integration)", () => {
  let t: TestApp;
  let admin: User;
  let buyer: User;

  const reminder = () => t.app.get(PayoutReminderService);

  const sale = async (merchantName: string, amount: number, status = OrderStatus.Paid) => {
    const merchant = await createMerchant(t.ds, { name: merchantName });
    const venue = await createVenue(t.ds, { merchantId: merchant.id });

    await createOrder(t.ds, {
      userId: buyer.id,
      venueId: venue.id,
      amount,
      status,
      paidAt: bishkek("2026-10-22T12:00:00"),
    });

    return merchant;
  };

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    admin = await createUser(t.ds, { role: "admin", language: "ru" });
    buyer = await createUser(t.ds);
  });

  afterAll(async () => {
    await t?.close();
  });

  it("Monday morning: what's still due for last week, the needs_review warning, to every admin", async () => {
    const second = await createUser(t.ds, { role: "admin", language: null });

    await sale("Coffee <Ali>", 30);
    const paid = await sale("Navat", 1000);

    await markPaidOut(t.ds, { merchantId: paid.id, period: WEEK, paidBy: admin.id });
    await sale("Sparta", 2000, OrderStatus.NeedsReview);

    expect(await reminder().run(MONDAY_10)).toBe(2);

    const toAdmin = t.bot.sent.find((m) => m.chatId === admin.telegramId)!;

    expect(toAdmin.html).toBe(
      "💸 Пора выплатить за 19.10.2026–25.10.2026:\n\n• Coffee &lt;Ali&gt; — 27 сом\n\nИтого: <b>27 сом</b>\n\n⚠️ На проверке: 1 — не входит в выплату, сначала разобрать.",
    );
    expect(toAdmin.button).toEqual({
      text: "Открыть приложение",
      url: "https://t.me/kuttuk_time_bot/app",
    });
    // Unknown language → kg.
    expect(t.bot.sent.find((m) => m.chatId === second.telegramId)!.html).toContain(
      "үчүн төлөп берүү убактысы келди",
    );
  });

  it("once per week: later runs that Monday send nothing; the next Monday — the next week", async () => {
    await sale("Coffee", 1000);

    expect(await reminder().run(MONDAY_10)).toBe(1);
    expect(await reminder().run(bishkek("2026-10-26T11:00:00"))).toBeNull();
    expect(t.bot.sent).toHaveLength(1);

    // Next Monday: the week 26.10–01.11 has no sales → claimed, nothing sent.
    expect(await reminder().run(bishkek("2026-11-02T10:00:00"))).toBe(0);
    expect(t.bot.sent).toHaveLength(1);
  });

  it.each([
    ["Monday 08:59", "2026-10-26T08:59:00"],
    ["Monday 21:00", "2026-10-26T21:00:00"],
    ["Tuesday 10:00", "2026-10-27T10:00:00"],
    ["Sunday 10:00", "2026-10-25T10:00:00"],
  ])("%s → not the time, nothing claimed", async (_label, at) => {
    await sale("Coffee", 1000);

    expect(await reminder().run(bishkek(at))).toBeNull();
    expect(t.bot.sent).toHaveLength(0);
    expect(await t.ds.query(`SELECT count(*)::int AS n FROM bot_digests`)).toEqual([{ n: 0 }]);
  });

  it("everything paid out and nothing to review → no message", async () => {
    const merchant = await sale("Coffee", 1000);

    await markPaidOut(t.ds, { merchantId: merchant.id, period: WEEK, paidBy: admin.id });

    expect(await reminder().run(MONDAY_10)).toBe(0);
    expect(t.bot.sent).toHaveLength(0);
  });

  it("only needs_review → 'nothing to pay' + the warning", async () => {
    await sale("Coffee", 1000, OrderStatus.NeedsReview);

    await reminder().run(MONDAY_10);

    expect(t.bot.sent[0].html).toBe(
      "💸 За 19.10.2026–25.10.2026 выплачивать нечего.\n\n⚠️ На проверке: 1 — не входит в выплату, сначала разобрать.",
    );
  });

  it("two overlapping runs remind once", async () => {
    await sale("Coffee", 1000);

    const results = await Promise.all([reminder().run(MONDAY_10), reminder().run(MONDAY_10)]);

    expect(results.sort()).toEqual([1, null].sort());
    expect(t.bot.sent).toHaveLength(1);
  });
});
