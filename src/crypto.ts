import randomBytes from "randombytes";
import { hash, sign } from "tweetnacl";
import { KeyPair, stringToUint8ArrayUtf8 } from "skynet-js";

import { toHexString } from "./util";
import { ENCRYPTION_ROOT_PATH_SEED_BYTES_LENGTH } from "./encrypted_files";

// Descriptive salt that should not be changed.
const SALT_ENCRYPTED_PATH_SEED = "encrypted filesystem path seed";

const SALT_ROOT_DISCOVERABLE_KEY = "root discoverable key";

/**
 * Derives the root path seed.
 *
 * @param seed - The user seed.
 * @returns - The root path seed.
 */
export function deriveRootPathSeed(seed: Uint8Array): Uint8Array {
  const bytes = new Uint8Array([...sha512(SALT_ENCRYPTED_PATH_SEED), ...sha512(seed)]);
  // NOTE: Truncate to 32 bytes instead of the 64 bytes for a directory path
  // seed. This is a historical artifact left for backwards compatibility.
  return sha512(bytes).slice(0, ENCRYPTION_ROOT_PATH_SEED_BYTES_LENGTH);
}

/**
 * Hashes the given message with the given salt applied.
 *
 * @param message - The message to hash (e.g. a seed).
 * @param salt - The salt to apply.
 * @returns - The hash.
 */
export function hashWithSalt(message: Uint8Array, salt: string): Uint8Array {
  return sha512(new Uint8Array([...sha512(salt), ...sha512(message)]));
}

/**
 * Generates a keypair from the given user seed. It first salts the seed.
 *
 * @param seed - The user seed as bytes.
 * @returns - The keypair.
 */
export function genKeyPairFromSeed(seed: Uint8Array): KeyPair {
  const hash = hashWithSalt(seed, SALT_ROOT_DISCOVERABLE_KEY);

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
 * Generates a random tweak of the given length in bytes.
 *
 * @param length - The number of random bytes for the tweak. Note that the final string will be in to hex representation, making it twice this length.
 * @returns - The generated tweak.
 */
export function genRandomTweak(length: number): string {
  // Cryptographically-secure random number generator. It should use the
  // built-in crypto.getRandomValues in the browser.
  const array = randomBytes(length);
  return toHexString(array);
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
