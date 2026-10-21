import { BadRequestException } from "@nestjs/common";

// Keyset pagination over (createdAt DESC, id DESC) for lists that grow on top (certificates,
// orders): new rows never shift a page already read. Query LIMIT pageLimit + 1 rows; the extra
// one only says whether there's a next page.

export const PAGE_DEFAULT = 50;
export const PAGE_MAX = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const pageLimit = (limit?: number): number => {
  const value = limit ?? PAGE_DEFAULT;

  if (!Number.isInteger(value) || value < 1 || value > PAGE_MAX) {
    throw new BadRequestException(`limit must be 1–${PAGE_MAX}`);
  }

  return value;
};

// Opaque to the client: "<createdAt ISO>|<id>" in base64url.
export const encodeCursor = (createdAt: Date, id: string): string =>
  Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");

export const decodeCursor = (cursor: string): { createdAt: Date; id: string } => {
  const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const createdAt = new Date(iso ?? "");

  if (Number.isNaN(createdAt.getTime()) || !id || !UUID.test(id)) {
    throw new BadRequestException("Invalid cursor");
  }

  return { createdAt, id };
};

// The page and the cursor to the next one, from rows fetched with LIMIT limit + 1.
export const toPage = <T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number,
): { page: T[]; nextCursor: string | null } => {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];

  return {
    page,
    nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
  };
};
