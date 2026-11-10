import type { Language } from "@/common/translations";

// What the buyer and the admin call an order: the first 8 characters of its uuid, upper case
// («Заказ №A1B2C3D4»). Shown on the order screen and in the bot messages about it; the admin
// «Заказы» search finds it. Not unique by construction - 16^8 ≈ 4·10^9, plenty at our volume,
// and the search would list both if two ever collided.
export const orderNumber = (orderId: string): string => orderId.slice(0, 8).toUpperCase();

export const orderNumberLine = (lang: Language, orderId: string): string => {
  const number = `<code>${orderNumber(orderId)}</code>`;

  switch (lang) {
    case "ru":
      return `Заказ №${number}`;
    case "en":
      return `Order #${number}`;
    case "kg":
      return `Буйрутма №${number}`;
  }
};
