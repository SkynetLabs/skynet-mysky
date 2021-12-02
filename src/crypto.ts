import { hash, sign } from "tweetnacl";
import { KeyPair, stringToUint8ArrayUtf8 } from "skynet-js";

import { toHexString } from "./util";

const SALT_ROOT_DISCOVERABLE_KEY = "root discoverable key";

export function hashSeedWithSalt(seed: Uint8Array, salt: string): Uint8Array {
  return sha512(new Uint8Array([...sha512(salt), ...sha512(seed)]));
}

/**
 * Generates a keypair from the given user seed. It first salts the seed.
 *
 * @param seed - The user seed as bytes.
 * @returns - The keypair.
 */
export function genKeyPairFromSeed(seed: Uint8Array): KeyPair {
  const hash = hashSeedWithSalt(seed, SALT_ROOT_DISCOVERABLE_KEY);

  return genKeyPairFromHash(hash);
}

/**
 * Generates a keypair from a given hash.
 *
 * @param hash - The hash.
 * @returns - The keypair.
 */
export function genKeyPairFromHash(hash: Uint8Array): KeyPair {
  const hashBytes = hash.slice(0, 32);

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
