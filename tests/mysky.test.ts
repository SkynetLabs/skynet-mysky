import { SkynetClient, stringToUint8ArrayUtf8 } from "skynet-js";
import { sha512 } from "../src/crypto";
import { MySky, saltSeedDevMode, saveSeed, SEED_DERIVATE_PREFIX } from "../src/mysky";
import { generatePhrase } from "../src/seed";
import { toHexString } from "../src/util";

// mock the crypto lib
//
// NOTE: this function does not replace the given array in-place, it merely
// avoids the function being undefined
//
// TODO: found out why this is not updating the array
const crypto = require("crypto");
Object.defineProperty(global.self, "crypto", {
  value: {
    getRandomValues: (arr: Uint16Array) => {
      arr = crypto.randomBytes(arr.length);
      return arr;
    },
  },
});

const domain = "some.skapp.hns.siasky.net";
describe("generateSeed", () => {
  let mysky: MySky;

  beforeAll(() => {
    const client = new SkynetClient();
    mysky = new MySky(client, domain);
  });

  it("it should return a derivative seed", () => {
    // assert it throws if seed is not found
    expect(() => mysky.fetchDerivativeSeed()).toThrow("User seed not found");

    // store a random seed
    const seed = generatePhrase();
    saveSeed(stringToUint8ArrayUtf8(seed));

    // fetch the derivate seed and assert it exists
    const actual = mysky.fetchDerivativeSeed();
    expect(actual).toBeDefined();

    // construct the expected derivate seed
    const parts = [
      ...stringToUint8ArrayUtf8(SEED_DERIVATE_PREFIX),
      ...stringToUint8ArrayUtf8(domain),
      ...saltSeedDevMode(stringToUint8ArrayUtf8(seed)), // dev mode
    ];
    const expected = toHexString(sha512(new Uint8Array(parts)));
    expect(actual).toBe(expected);
    expect(actual).toHaveLength(128);
  });
});
