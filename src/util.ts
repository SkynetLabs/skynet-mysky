import { Buffer } from "buffer";
import { permCategoryToString, Permission, permTypeToString } from "skynet-mysky-utils";

const urlParams = new URLSearchParams(window.location.search);
const DEBUG_ENABLED = urlParams.get("debug") === "true";

/**
 * Prints to stdout, only if DEBUG_ENABLED flag is set.
 *
 * @param message - The message to print.
 * @param {...any} optionalContext - The optional context.
 */
export function log(message: string, ...optionalContext: any[]): void {
  if (DEBUG_ENABLED) {
    console.log(message, ...optionalContext);
  }
}

/**
 * Constructs a human-readable version of the permission.
 *
 * @param perm - The given permission.
 * @returns - The string.
 */
export function readablePermission(perm: Permission): string {
  const category = permCategoryToString(perm.category);
  const permType = permTypeToString(perm.permType);

  return `${perm.requestor} can ${permType} ${category} files at ${perm.path}`;
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

/**
 * Convert a hex encoded string to a uint8 array
 *
 * @param hexString - The hex-encoded string to convert.
 * @returns - The byte array, or null if the hex string was invalid
 */
export function fromHexString(hexString: string): Uint8Array | null {
  // sanity check the input is valid hex and not empty
  if (!hexString.match(/^[0-9a-fA-F]+$/)) {
    return null;
  }

  const matches = hexString.toLowerCase().match(/[0-9a-f]{1,2}/g);
  if (!matches) {
    // this should never happen as we sanity checked the input, therefore we
    // throw an error indicating it was unexpected
    throw new Error(`Unexpected error, hex string '${hexString}' could not be converted to bytes`);
  }

  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}
