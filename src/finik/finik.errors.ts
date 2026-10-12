export class FinikApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly finikStatusCode?: number,
  ) {
    super(message);
    this.name = "FinikApiError";
  }
}

export class FinikNetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FinikNetworkError";
  }
}

export class FinikTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Finik request timed out after ${timeoutMs}ms`);
    this.name = "FinikTimeoutError";
  }
}
