// With target ES2024, a DTO instance has every declared field, the omitted ones as undefined.
// Object.assign(entity, dto) would blank those on the entity — the DB is fine (TypeORM skips
// undefined on save), but the response would lose them. Apply only what was actually sent.
export const definedFields = <T extends object>(dto: T): Partial<T> =>
  Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined)) as Partial<T>;
