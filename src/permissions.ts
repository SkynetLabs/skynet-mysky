/**
 * @file - Helpers for permissions.
 */

import { sanitizePath } from "skynet-mysky-utils";

/**
 * Creates the bitfield for the given category and permission type.
 *
 * @param category - The permission category.
 * @param permType = The permission type.
 * @returns - The bitfield.
 */
export function createPermissionBitfield(category: number, permType: number): number {
  // Reserve space for 16 perm types.
  const bit = (category - 1) * 16 + permType;
  return 1 << bit;
}

/**
 * Creates the permission key for the given requestor and path.
 *
 * @param requestor - The permission requestor.
 * @param path - The permission path.
 * @returns - The permission key.
 * @throws - Will throw if the requestor or path are invalid.
 */
export function createPermissionKey(requestor: string, path: string): string {
  const sanitizedRequestor = sanitizePath(requestor);
  if (sanitizedRequestor === null) {
    throw new Error(`Invalid requestor: '${requestor}'`);
  }
  const sanitizedPath = sanitizePath(path);
  if (sanitizedPath === null) {
    throw new Error(`Invalid path: '${path}'`);
  }
  return `[${sanitizedRequestor}],[${sanitizedPath}]`;
}
