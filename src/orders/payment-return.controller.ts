import { Controller, Get, Inject, Logger, Param, Redirect, Req } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { ApiExcludeController } from "@nestjs/swagger";
import { isUUID } from "class-validator";
import type { Request } from "express";

import { paymentRedirectUrl, webOrderUrl } from "./payment-redirect-url";
import { websiteUrl } from "@/common/website-url";
import { Public } from "@/auth/public.decorator";
import { finikConfig } from "@/finik/finik.config";

// Where Finik sends the buyer after paying (see paymentReturnUrl). Public - the buyer's browser
// has no JWT here; default rate limit by IP. Deliberately doesn't look the order up: the
// response is the same whether it exists or not, so nothing is disclosed.
@ApiExcludeController()
@Public()
@Controller("payments")
export class PaymentReturnController {
  private readonly logger = new Logger(PaymentReturnController.name);

  constructor(@Inject(finikConfig.KEY) private readonly finik: ConfigType<typeof finikConfig>) {}

  @Get("return/:orderId")
  @Redirect(undefined, 302)
  return(@Param("orderId") orderId: string, @Req() req: Request): { url: string } {
    // Full incoming URL, query included - to see what Finik appends to our RedirectUrl.
    this.logger.log(`Payment return: ${req.originalUrl}`);

    return {
      url: isUUID(orderId)
        ? paymentRedirectUrl(this.finik.redirectUrl, orderId)
        : this.finik.redirectUrl,
    };
  }

  // An order placed on the website: back to its page there. Without a configured website the
  // Mini App link is the fallback.
  @Get("return/:orderId/web")
  @Redirect(undefined, 302)
  returnToWebsite(@Param("orderId") orderId: string, @Req() req: Request): { url: string } {
    this.logger.log(`Payment return (web): ${req.originalUrl}`);

    const site = websiteUrl();

    if (!site) {
      return this.return(orderId, req);
    }

    return { url: isUUID(orderId) ? webOrderUrl(site, orderId) : site };
  }
}
