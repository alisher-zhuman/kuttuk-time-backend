import { encode as encodeJpeg } from "jpeg-js";
import { encode as encodeQr } from "uqr";

// A QR of a certificate code as a JPEG — for the gift card's photo (Telegram takes only JPEG
// by URL for an inline photo). The same library as the frontend (uqr), so both encode the
// code the same way: the 8 digits, no spaces. Black on white, a quiet zone of 4 modules.
const MODULE_PX = 16;
const QUIET_ZONE = 4;

export const certificateQrJpeg = (code: string): Buffer => {
  const qr = encodeQr(code, { ecc: "M", border: QUIET_ZONE });
  const px = qr.size * MODULE_PX;
  const rgba = Buffer.alloc(px * px * 4, 0xff); // white

  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.data[y][x]) {
        continue;
      }

      for (let dy = 0; dy < MODULE_PX; dy++) {
        const row = ((y * MODULE_PX + dy) * px + x * MODULE_PX) * 4;

        for (let dx = 0; dx < MODULE_PX; dx++) {
          const i = row + dx * 4;

          rgba[i] = rgba[i + 1] = rgba[i + 2] = 0; // black, alpha stays 0xff
        }
      }
    }
  }

  return encodeJpeg({ data: rgba, width: px, height: px }, 90).data;
};
