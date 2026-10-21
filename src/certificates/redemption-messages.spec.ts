import { LANGUAGES } from "@/common/translations";
import { redeemedMessage } from "./redemption-messages";

describe("redeemedMessage", () => {
  // 08:30 UTC = 14:30 in Bishkek.
  const used = {
    venue: "Café <Ali> & Co",
    amount: 500,
    code: "12345678",
    usedAt: new Date("2026-10-21T08:30:00Z"),
  };

  it.each(LANGUAGES)(
    "%s: the code, the escaped venue, the amount, date and time in Bishkek",
    (lang) => {
      const { html, button } = redeemedMessage(lang, used);

      expect(html).toContain("<code>1234 5678</code>");
      expect(html).toContain("<b>Café &lt;Ali&gt; &amp; Co</b>");
      expect(html).toContain("500");
      expect(html).toContain("21.10.2026");
      expect(html).toContain("14:30");
      expect(button).toBeTruthy();
    },
  );
});
