import { BadRequestException, type PipeTransform } from "@nestjs/common";

// A database id from the path or the query: a positive int4. ParseIntPipe accepts any integer,
// so "99999999999" reached Postgres as an int and came back as a 500 ("out of range").
export const MAX_INT4 = 2_147_483_647;

export const isDbId = (value: string): boolean =>
  /^[1-9]\d{0,9}$/.test(value) && Number(value) <= MAX_INT4;

export class ParseIdPipe implements PipeTransform<string | undefined, number | undefined> {
  constructor(private readonly options: { optional?: boolean } = {}) {}

  transform(value: string | undefined): number | undefined {
    if (value === undefined || value === "") {
      if (this.options.optional) {
        return undefined;
      }

      throw new BadRequestException("id is required");
    }

    if (!isDbId(value)) {
      throw new BadRequestException("id must be a positive integer");
    }

    return Number(value);
  }
}
