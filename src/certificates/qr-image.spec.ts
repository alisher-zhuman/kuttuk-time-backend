import { decode } from "jpeg-js";
import jsQR from "jsqr";
import * as fc from "fast-check";

import { certificateQrJpeg } from "./qr-image";

const read = (jpeg: Buffer): string | undefined => {
  const image = decode(jpeg, { useTArray: true });

  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data;
};

describe("certificateQrJpeg", () => {
  it("is a real JPEG that a QR reader decodes back to the exact 8 digits", () => {
    const jpeg = certificateQrJpeg("04718263");

    expect(jpeg.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff])); // JPEG magic
    expect(read(jpeg)).toBe("04718263");
  });

  it("any 8-digit code round-trips (leading zeros kept)", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{8}$/), (code) => {
        expect(read(certificateQrJpeg(code))).toBe(code);
      }),
      { numRuns: 30 },
    );
  });
});
