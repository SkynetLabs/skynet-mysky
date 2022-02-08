// TODO: Many of these utils are copied from `skynet-js`. Move them to a shared
// `skynet-utils` library.

import { Buffer } from "buffer";
import { permCategoryToString, Permission, permTypeToString } from "skynet-mysky-utils";

const urlParams = new URLSearchParams(window.location.search);
export const ALPHA_ENABLED = urlParams.get("alpha") === "true";
export const DEBUG_ENABLED = urlParams.get("debug") === "true";
export const DEV_ENABLED = urlParams.get("dev") === "true";

/**
 * Converts a hex encoded string to a uint8 array.
 *
 * @param str - The string to convert.
 * @returns - The uint8 array.
 * @throws - Will throw if the input is not a valid hex-encoded string or is an empty string.
 */
export function hexToUint8Array(str: string): Uint8Array {
  validateHexString("str", str, "parameter");

  const matches = str.match(/.{1,2}/g);
  if (matches === null) {
    throw validationError("str", str, "parameter", "a hex-encoded string");
  }

  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

/**
 * Returns true if the input is a valid hex-encoded string.
 *
 * @param str - The input string.
 * @returns - True if the input is hex-encoded.
 * @throws - Will throw if the input is not a string.
 */
export function isHexString(str: string): boolean {
  validateString("str", str, "parameter");

  return /^[0-9A-Fa-f]*$/g.test(str);
}

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

// ====================
// Validation Functions
// ====================

/**
 * Validates the given value as an object.
 *
 * @param name - The name of the value.
 * @param value - The actual value.
 * @param valueKind - The kind of value that is being checked (e.g. "parameter", "response field", etc.)
 * @throws - Will throw if not a valid object.
 */
export function validateObject(name: string, value: unknown, valueKind: string): void {
  if (typeof value !== "object") {
    throwValidationError(name, value, valueKind, "type 'object'");
  }
  if (value === null) {
    throwValidationError(name, value, valueKind, "non-null");
  }
}

/**
 * Validates the given value as a string.
 *
 * @param name - The name of the value.
 * @param value - The actual value.
 * @param valueKind - The kind of value that is being checked (e.g. "parameter", "response field", etc.)
 * @throws - Will throw if not a valid string.
 */
export function validateString(name: string, value: unknown, valueKind: string): void {
  if (typeof value !== "string") {
    throwValidationError(name, value, valueKind, "type 'string'");
  }
}

/**
 * Validates the given value as a hex-encoded string.
 *
 * @param name - The name of the value.
 * @param value - The actual value.
 * @param valueKind - The kind of value that is being checked (e.g. "parameter", "response field", etc.)
 * @throws - Will throw if not a valid hex-encoded string.
 */
export function validateHexString(name: string, value: unknown, valueKind: string): void {
  validateString(name, value, valueKind);
  if (!isHexString(value as string)) {
    throwValidationError(name, value, valueKind, "a hex-encoded string");
  }
}

/**
 * Validates the given value as a uint8array.
 *
 * @param name - The name of the value.
 * @param value - The actual value.
 * @param valueKind - The kind of value that is being checked (e.g. "parameter", "response field", etc.)
 * @throws - Will throw if not a valid uint8array.
 */
export function validateUint8Array(name: string, value: unknown, valueKind: string): void {
  if (!(value instanceof Uint8Array)) {
    throwValidationError(name, value, valueKind, "type 'Uint8Array'");
  }
}

/**
 * Validates the given value as a uint8array of the given length.
 *
 * @param name - The name of the value.
 * @param value - The actual value.
 * @param valueKind - The kind of value that is being checked (e.g. "parameter", "response field", etc.)
 * @param len - The length to check.
 * @throws - Will throw if not a valid uint8array of the given length.
 */
export function validateUint8ArrayLen(name: string, value: unknown, valueKind: string, len: number): void {
  validateUint8Array(name, value, valueKind);
  const actualLen = (value as Uint8Array).length;
  if (actualLen !== len) {
    throwValidationError(name, value, valueKind, `type 'Uint8Array' of length ${len}, was length ${actualLen}`);
  }
}

/**
 * Throws an error for the given value
 *
 * @param name - The name of the value.
 * @param value - The actual value.
 * @param valueKind - The kind of value that is being checked (e.g. "parameter", "response field", etc.)
 * @param expected - The expected aspect of the value that could not be validated (e.g. "type 'string'" or "non-null").
 * @throws - Will always throw.
 */
export function throwValidationError(name: string, value: unknown, valueKind: string, expected: string): void {
  throw validationError(name, value, valueKind, expected);
}

/**
 * Returns an error for the given value
 *
 * @param name - The name of the value.
 * @param value - The actual value.
 * @param valueKind - The kind of value that is being checked (e.g. "parameter", "response field", etc.)
 * @param expected - The expected aspect of the value that could not be validated (e.g. "type 'string'" or "non-null").
 * @returns - The validation error.
 */
export function validationError(name: string, value: unknown, valueKind: string, expected: string): Error {
  let actualValue: string;
  if (value === undefined) {
    actualValue = "type 'undefined'";
  } else if (value === null) {
    actualValue = "type 'null'";
  } else {
    actualValue = `type '${typeof value}', value '${value}'`;
  }
  return new Error(`Expected ${valueKind} '${name}' to be ${expected}, was ${actualValue}`);
}
