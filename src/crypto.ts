import { hash, sign } from "tweetnacl";
import { KeyPair, stringToUint8ArrayUtf8 } from "skynet-js";

import { toHexString } from "./util";

const SALT_ROOT_DISCOVERABLE_KEY = "root discoverable key";

/**
 * Generates a keypair from the given user seed. It first salts the seed.
 *
 * @param seed - The user seed as bytes.
 * @returns - The keypair.
 */
export function genKeyPairFromSeed(seed: Uint8Array): KeyPair {
  const bytes = new Uint8Array([...sha512(SALT_ROOT_DISCOVERABLE_KEY), ...sha512(seed)]);
  const hashBytes = sha512(bytes).slice(0, 32);

  const { publicKey, secretKey } = sign.keyPair.fromSeed(hashBytes);

  return { publicKey: toHexString(publicKey), privateKey: toHexString(secretKey) };
}

/**
 * Hashes the given string or byte array using sha512.
 *
 * @param message - The string or byte array to hash.
 * @returns - The resulting hash.
 */
export function sha512(message: Uint8Array | string): Uint8Array {
  if (typeof message === "string") {
    return hash(stringToUint8ArrayUtf8(message));
  }
  return hash(message);
}
