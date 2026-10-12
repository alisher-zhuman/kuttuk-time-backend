import type { ContainerHolder } from "./global-setup";

export default async (): Promise<void> => {
  await (globalThis as ContainerHolder).__PG_CONTAINER__?.stop();
};
