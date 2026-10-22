import { Controller, Get, Header, NotFoundException, Param, StreamableFile } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { CERTIFICATE_CODE_PATTERN } from "./certificate-code";
import { certificateQrJpeg } from "./qr-image";
import { Public } from "@/auth/public.decorator";

// GET /api/qr/<8 digits>.jpg — the picture for the gift card (Telegram fetches it by URL).
// Public and safe: it draws whatever 8 digits it's given and never looks a certificate up, so it
// tells nothing about which codes exist. Cached for a year — a code's picture never changes.
@ApiExcludeController()
@Public()
@Controller("qr")
export class QrController {
  @Get(":file")
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Header("Content-Type", "image/jpeg")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  image(@Param("file") file: string): StreamableFile {
    const code = /^(\d{8})\.jpg$/.exec(file)?.[1];

    if (!code || !CERTIFICATE_CODE_PATTERN.test(code)) {
      throw new NotFoundException();
    }

    return new StreamableFile(certificateQrJpeg(code));
  }
}
