import { extractNormalizedDomain } from "../../src/util";

describe("extractNormalizedDomain", () => {
  const cases = ["siasky.net", "siasky.net/", "https://siasky.net", "https://siasky.net/"].map((domainOrUrl) => [
    domainOrUrl,
    "siasky.net",
  ]);

  it.each(cases)("('%s') should result in '%s'", (domainOrUrl, expectedDomain) => {
    const domain = extractNormalizedDomain(domainOrUrl);
    expect(domain).toEqual(expectedDomain);
  });
});
