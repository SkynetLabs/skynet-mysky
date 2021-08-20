// Make Typescript happy, requires "lib": ["webworker"].
// @ts-ignore Can't make this work.
declare const self: DedicatedWorkerGlobalScope;

import { clear, get, set, update } from "idb-keyval";
import { ChildHandshake, WorkerMessenger } from "post-me";
import type { Connection } from "post-me";
import { CheckPermissionsResponse, getParentPath, getPathDomain, Permission, sanitizePath } from "skynet-mysky-utils";

const version = 2;
const versionKey = "_v";

let parentConnection: Connection | null = null;

// ==============
// Initialization
// ==============

const methods = {
  checkPermissions,
  setPermissions,
};

(async () => {
  const messenger = new WorkerMessenger({ worker: self });
  parentConnection = await ChildHandshake(messenger, methods);
})().catch((error) => {
  // Let the error be handled by self.onerror handler.
  throw error;
});

// ======
// Events
// ======

self.onerror = function (error: any) {
  console.log(error);
  if (parentConnection) {
    if (typeof error === "string") {
      void parentConnection.remoteHandle().call("catchError", error);
    } else {
      void parentConnection.remoteHandle().call("catchError", error.type);
    }
  }
};

// ==========
// Public API
// ==========

/**
 * Checks the given permissions and returns a list of which permissions were
 * granted and a list of which were rejected.
 *
 * @param perms - The permissions to check.
 * @param [dev=false] - Whether to check permissions in dev mode (all granted).
 * @returns - A list of granted permissions and a list of rejected permissions.
 */
export async function checkPermissions(perms: Permission[], dev = false): Promise<CheckPermissionsResponse> {
  if (!dev) {
    // Check the version and clear old permissions if we've updated the permission storage scheme.
    await validateVersion();
  }

  const grantedPermissions: Permission[] = [];
  const failedPermissions: Permission[] = [];

  // If in dev mode, allow all permissions.
  if (dev) {
    grantedPermissions.push(...perms);
  } else {
    await Promise.all(
      perms.map(async (perm) => {
        const granted = await checkPermission(perm);
        if (granted) {
          grantedPermissions.push(perm);
        } else {
          failedPermissions.push(perm);
        }
      })
    );
  }

  return { grantedPermissions, failedPermissions };
}

/**
 * Sets the given granted permissions by saving them in browser storage.
 *
 * @param grantedPermissions - The granted permissions.
 */
export async function setPermissions(grantedPermissions: Permission[]): Promise<void> {
  // Check the version and clear old permissions if we've updated the permission storage scheme.
  await validateVersion();

  // TODO: Optimization: do a first-pass to combine permissions into bitfields.

  await Promise.all(
    grantedPermissions.map(async (perm) => {
      await savePermission(perm);
    })
  );
  return;
}

// ==========
// Core Logic
// ==========

/**
 * Checks the given permission by querying local storage.
 *
 * @param perm - The given permission to check.
 * @returns - A boolean indicating whether the permission was found and granted.
 */
async function checkPermission(perm: Permission): Promise<boolean> {
  const requestor = sanitizePath(perm.requestor);
  const pathDomain = getPathDomain(perm.path);

  // Allow all permissions where the requestor matches the path domain.
  if (requestor === pathDomain) {
    return true;
  }

  // Check if the permission was stored in IndexedDB.
  //
  // Iterate over the path and all parents of the path.
  let path: string | null = sanitizePath(perm.path);
  while (path) {
    // TODO: Check top-level domains first, as those are most likely to be set?

    // If permission was granted to the path or a parent, return true.
    const permToCheck = new Permission(perm.requestor, path, perm.category, perm.permType);
    const granted = await fetchPermission(permToCheck);
    if (granted === true) {
      return true;
    }

    // Set the path to the current path's parent.
    path = getParentPath(path);
  }

  return false;
}

/**
 * Check the version and clear old permissions if we've updated the permissions scheme.
 */
async function validateVersion(): Promise<void> {
  // Get the version.
  const oldVersion = await get(versionKey);

  // Clear old permissions if we're on a new version.
  if (!oldVersion || oldVersion < version) {
    await clear();
  }

  // Set the latest version.
  await set(versionKey, version);
}

/**
 * Fetches the permission status from storage.
 *
 * @param perm - The given permission.
 * @returns - A boolean indicating whether the permission was found.
 */
async function fetchPermission(perm: Permission): Promise<boolean> {
  const key = createPermissionKey(perm.requestor, perm.path);
  const storedBitfield = await get(key);
  if (!storedBitfield) {
    return false;
  }
  const bitfieldToCheck = createPermissionBitfield(perm.category, perm.permType);
  return (storedBitfield & bitfieldToCheck) > 0;
}

/**
 * Saves the permission to browser storage.
 *
 * @param perm - The given permission.
 */
async function savePermission(perm: Permission): Promise<void> {
  const key = createPermissionKey(perm.requestor, perm.path);
  const bitfieldToAdd = createPermissionBitfield(perm.category, perm.permType);
  await update(key, (storedBitfield: number | undefined) => (storedBitfield || 0) | bitfieldToAdd);
}

// =======
// Helpers
// =======

/**
 * Creates the bitfield for the given category and permission type.
 *
 * @param category - The permission category.
 * @param permType = The permission type.
 * @returns - The bitfield.
 */
function createPermissionBitfield(category: number, permType: number): number {
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
