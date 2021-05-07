import { KeyPair } from "skynet-js/dist/crypto";
import { hash, sign } from "tweetnacl";

const urlParams = new URLSearchParams(window.location.search);
const DEBUG_ENABLED = urlParams.get("debug") === "true";

// log prints to stdout only if DEBUG_ENABLED flag is set
/**
 * @param message
 * @param {...any} optionalContext
 */
export function log(message: string, ...optionalContext: any[]) {
  if (DEBUG_ENABLED) {
    console.log(message, ...optionalContext);
  }
}

/**
 * @param seed
 */
export function genKeyPairFromSeed(seed: Uint8Array): KeyPair {
  const bytes = hash(hash(stringToUint8ArrayUtf8("root discoverable key")) || hash(seed));

  const { publicKey, secretKey } = sign.keyPair.fromSeed(bytes);

  return { publicKey: toHexString(publicKey), privateKey: toHexString(secretKey) };
}

/**
 * Converts a UTF-8 string to a uint8 array containing valid UTF-8 bytes.
 *
 * @param str - The string to convert.
 * @returns - The uint8 array.
 * @throws - Will throw if the input is not a string.
 */
export function stringToUint8ArrayUtf8(str: string): Uint8Array {
  return Uint8Array.from(Buffer.from(str, "utf-8"));
}

/**
 * Convert a byte array to a hex string.
 *
 * @param byteArray - The byte array to convert.
 * @returns - The hex string.
 * @see {@link https://stackoverflow.com/a/44608819|Stack Overflow}
 */
export function toHexString(byteArray: Uint8Array): string {
  let s = "";
  byteArray.forEach(function (byte) {
    s += ("0" + (byte & 0xff).toString(16)).slice(-2);
  });
  return s;
}
