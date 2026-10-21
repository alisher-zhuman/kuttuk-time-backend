import { LANGUAGES, toLanguage } from "@/common/translations";
import { buyerMessage, ownerMessage } from "./sale-messages";

const SALE = {
  venue: "Café <Ali> & Co",
  amount: 1000,
  code: "KT-ABCD-2345",
  // 20:00 UTC = 02:00 the next day in Bishkek.
  validUntil: new Date("2027-10-20T20:00:00Z"),
};

describe("sale messages", () => {
  it.each(LANGUAGES)(
    "%s: buyer gets the code (tap to copy), the amount and the Bishkek date",
    (lang) => {
      const { html, button } = buyerMessage(lang, SALE);

      expect(html).toContain("<code>KT-ABCD-2345</code>");
      expect(html).toContain("1000");
      expect(html).toContain("21.10.2027");
      expect(html).toContain("<b>Café &lt;Ali&gt; &amp; Co</b>");
      expect(button).toBeTruthy();
    },
  );

  it.each(LANGUAGES)("%s: the owner's message has no code", (lang) => {
    const { html } = ownerMessage(lang, SALE);

    expect(html).toContain("<b>Café &lt;Ali&gt; &amp; Co</b>");
    expect(html).toContain("1000");
    expect(html).not.toContain("KT-");
  });
});

describe("toLanguage", () => {
  it.each([
    ["kg", "kg"],
    ["ky", "kg"],
    ["ru-RU", "ru"],
    [" EN ", "en"],
    ["de", null],
    ["", null],
    [undefined, null],
  ])("%p → %p", (header, expected) => {
    expect(toLanguage(header)).toBe(expected);
  });
});
