import { fromHexString, toHexString } from "../src/util";

describe("util", () => {
  // random MySky public key bytes
  const publicKeyBytes = new Uint8Array([
    137, 133, 59, 37, 51, 39, 235, 199, 244, 206, 146, 188, 24, 222, 246, 175, 13, 210, 174, 115, 68, 20, 28, 212, 16,
    10, 243, 140, 56, 233, 199, 168,
  ]);

  it("should properly convert a byte array to hex string", () => {
    const hexStr = toHexString(publicKeyBytes);
    expect(hexStr).toEqual("89853b253327ebc7f4ce92bc18def6af0dd2ae7344141cd4100af38c38e9c7a8");
  });

  it("should properly converted a hex string to a uint8array", () => {
    // assert the hex string matches our public key bytes
    const byteArray = fromHexString("89853b253327ebc7f4ce92bc18def6af0dd2ae7344141cd4100af38c38e9c7a8");
    expect(byteArray).toEqual(publicKeyBytes);

    // assert it returns null if the input is empty
    expect(fromHexString("")).toBeNull();

    // assert it returns null if the input is invalid hex (note the 'g')
    expect(fromHexString("g9853b253327ebc7f4ce92bc18def6af0dd2ae7344141cd4100af38c38e9c7a8")).toBeNull();
  });
});
