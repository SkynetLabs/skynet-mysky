import { genKeyPairFromSeed } from "../src/crypto";

describe("genKeyPairFromSeed", () => {
  it("should generate correct hard-coded value", () => {
    // Hard-code expected value to catch breaking changes.
    const expectedPublicKey = "31c086e5782c7de9082ebb51cad36684689eac3dd65c6100d159d7c533de0cd6";
    const expectedPrivateKey =
      "d3cf2cf82ab40da270a09e2eac63aa11b5284e2c16155ab90ab76f7e64e04a1031c086e5782c7de9082ebb51cad36684689eac3dd65c6100d159d7c533de0cd6";
    const seed = [223, 213, 194, 46, 33, 71, 77, 37, 230, 60, 0, 49, 246, 248, 203, 3];

    const { publicKey, privateKey } = genKeyPairFromSeed(new Uint8Array(seed));

    expect(publicKey).toEqual(expectedPublicKey);
    expect(privateKey).toEqual(expectedPrivateKey);
  });
});
