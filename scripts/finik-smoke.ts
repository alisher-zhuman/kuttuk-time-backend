// Manual check against the real Finik API: `npm run finik:smoke` (reads .env). Not for CI.
import { randomUUID } from "node:crypto";

import { finikConfig } from "../src/finik/finik.config";
import { FinikService } from "../src/finik/finik.service";

const main = async () => {
  const service = new FinikService(finikConfig());
  const paymentId = randomUUID();

  const { paymentUrl } = await service.createPayment({
    paymentId,
    amount: 1,
    nameEn: "KuttukTime smoke test",
    description: "Smoke test, 1 KGS",
  });

  console.log(`paymentId:  ${paymentId}`);
  console.log(`paymentUrl: ${paymentUrl}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
