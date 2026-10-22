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

// The cursor timestamp straight from Postgres, to the microsecond. A JS Date keeps only
// milliseconds: a cursor built from it (".123") sorts *before* a row stored at ".123456", so rows
// older than the page's last one but in the same millisecond were silently skipped. Select it as
// `${CURSOR_AT('c."createdAt"')} AS "cursorAt"` next to the row.
export const CURSOR_AT = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

// Opaque to the client: "<createdAt, µs, UTC>|<id>" in base64url.
export const encodeCursor = (at: string, id: string): string =>
  Buffer.from(`${at}|${id}`).toString("base64url");

// `at` goes back to SQL as $n::timestamptz — the exact stored value.
export const decodeCursor = (cursor: string): { at: string; id: string } => {
  const [at, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");

  if (!at || !CURSOR_TIME.test(at) || Number.isNaN(Date.parse(at)) || !id || !UUID.test(id)) {
    throw new BadRequestException("Invalid cursor");
  }

  return { at, id };
};

// The page and the cursor to the next one, from rows fetched with LIMIT limit + 1.
export const toPage = <T extends { cursorAt: string; id: string }>(
  rows: T[],
  limit: number,
): { page: T[]; nextCursor: string | null } => {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];

  return {
    page,
    nextCursor: rows.length > limit && last ? encodeCursor(last.cursorAt, last.id) : null,
  };
};
