import { generateKeyPairSync } from "node:crypto";
import * as fc from "fast-check";
import { Signer } from "@mancho.devs/authorizer";
import type { RequestData } from "@mancho.devs/authorizer/types";

import { buildCanonicalString, sign, verify, type FinikRequest } from "./finik-signer";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

// Graphemes keep strings well-formed (no lone surrogates); '%' fragments are mixed in on purpose,
// so malformed escapes are exercised too — then both implementations must throw.
const text = fc.oneof(
  { weight: 4, arbitrary: fc.string({ unit: "grapheme", maxLength: 12 }) },
  {
    weight: 1,
    arbitrary: fc.constantFrom("%", "%20", "%D0%BA", "%E0%A4%A", "a b", "кофе", "😀/?&=#"),
  },
);

const headerName = fc.stringMatching(/^[a-z0-9-]{1,10}$/);
const xApiHeaders = fc.dictionary(
  fc.tuple(fc.constantFrom("x-api-", "X-Api-", "X-API-"), headerName).map(([p, n]) => p + n),
  text,
  { maxKeys: 4 },
);
const otherHeaders = fc.dictionary(
  headerName.filter((n) => !n.startsWith("x-api-") && n !== "host"),
  text,
  { maxKeys: 3 },
);

const request: fc.Arbitrary<FinikRequest> = fc.record({
  httpMethod: fc.constantFrom("GET", "POST", "PUT", "PATCH", "DELETE", "post", "Get"),
  path: fc.array(text, { maxLength: 4 }).map((segments) => `/${segments.join("/")}`),
  headers: fc
    .tuple(fc.string({ unit: "grapheme", minLength: 1, maxLength: 20 }), xApiHeaders, otherHeaders)
    .map(([host, api, other]) => ({ ...other, ...api, Host: host })),
  queryStringParameters: fc.option(
    fc.dictionary(text, fc.option(text, { nil: undefined }), { maxKeys: 4 }),
    { nil: null },
  ),
  body: fc.option(fc.dictionary(text, fc.jsonValue({ maxDepth: 3 }), { maxKeys: 6 }), {
    nil: null,
  }),
});

const outcome = (fn: () => string): { ok: string } | { threw: true } => {
  try {
    return { ok: fn() };
  } catch {
    return { threw: true };
  }
};

const libraryCanonical = (req: FinikRequest): string =>
  (new Signer(req as RequestData) as unknown as { getData(): string }).getData();

describe("finik-signer (property-based, vs @mancho.devs/authorizer)", () => {
  beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("buildCanonicalString equals the library's, or both throw", () => {
    fc.assert(
      fc.property(request, (req) => {
        expect(outcome(() => buildCanonicalString(req))).toEqual(
          outcome(() => libraryCanonical(req)),
        );
      }),
      { numRuns: 1000 },
    );
  });

  it("signatures are identical and each side verifies the other's", async () => {
    await fc.assert(
      fc.asyncProperty(request, async (req) => {
        fc.pre(!("threw" in outcome(() => buildCanonicalString(req))));

        const ours = sign(req, privateKey);
        const theirs = await new Signer(req as RequestData).sign(privateKey);

        expect(ours).toBe(theirs);
        expect(verify(req, theirs, publicKey)).toBe(true);
        await expect(new Signer(req as RequestData).verify(publicKey, ours)).resolves.toBe(true);
      }),
      { numRuns: 60 },
    );
  });
});
