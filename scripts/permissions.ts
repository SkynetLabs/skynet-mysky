// Make Typescript happy, requires "lib": ["webworker"].
declare const self: DedicatedWorkerGlobalScope;

import { get, update } from "idb-keyval";
import { ChildHandshake, WorkerMessenger } from "post-me";
import type { Connection } from "post-me";
import { CheckPermissionsResponse, Permission } from "skynet-mysky-utils";

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
})();

// ==========
// Public API
// ==========

export async function checkPermissions(perms: Permission[], dev = false): Promise<CheckPermissionsResponse> {
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

export async function setPermissions(grantedPermissions: Permission[]): Promise<void> {
  // TODO: Optimization: do a first-pass to combine permissions into bitfields.

  await Promise.all(
    grantedPermissions.map(async (perm) => {
      await savePermission(perm);
    })
  );
  return;
}

// ======
// Events
// ======

self.onerror = function (error: any) {
  console.log(error);
  if (parentConnection) {
    if (typeof error === "string") {
      parentConnection.remoteHandle().call("catchError", error);
    } else {
      parentConnection.remoteHandle().call("catchError", error.type);
    }
  }
};

// ==========
// Core Logic
// ==========

async function checkPermission(perm: Permission): Promise<boolean> {
  const requestor = trimSuffix(perm.requestor, "/");
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
    // TODO: Check top-level domains first, as those are most likely to be set.

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

async function fetchPermission(perm: Permission): Promise<boolean> {
  const key = createPermissionKey(perm.requestor, perm.path);
  const storedBitfield = await get(key);
  if (!storedBitfield) {
    return false;
  }
  const bitfieldToCheck = (1 << perm.category) | (1 << perm.permType);
  return (storedBitfield & bitfieldToCheck) > 0;
}

async function savePermission(perm: Permission): Promise<void> {
  const key = createPermissionKey(perm.requestor, perm.path);
  const bitfieldToAdd = (1 << perm.category) | (1 << perm.permType);
  await update(key, (storedBitfield: number | undefined) => (storedBitfield || 0) | bitfieldToAdd);
}

function createPermissionKey(requestor: string, path: string): string {
  requestor = trimSuffix(requestor, "/");
  path = sanitizePath(path);
  return `[${requestor}],[${path}]`;
}

// =======
// Helpers
// =======

// TODO: Move to mysky-utils
export function getPathDomain(path: string): string {
  return path.split("/")[0];
}

// TODO: Move to mysky-utils
export function getParentPath(path: string): string | null {
  path = sanitizePath(path);
  const pathArray = path.split("/");

  if (pathArray.length <= 1) {
    return null;
  }

  pathArray.pop();
  path = pathArray.join("/");
  return path;
}

// TODO: Move to mysky-utils
export function sanitizePath(path: string): string {
  // Remove trailing slashes.
  path = trimSuffix(path, "/");

  // Remove duplicate adjacent slashes.
  const pathArray = Array.from(path);
  for (let i = 0; i < pathArray.length - 1; ) {
    if (pathArray[i] === "/" && pathArray[i + 1] === "/") {
      pathArray.splice(i, 1);
    } else {
      i++;
    }
  }
  path = pathArray.join("");

  return path;
}

/**
 * Removes a suffix from the end of the string.
 *
 * @param str - The string to process.
 * @param suffix - The suffix to remove.
 * @param [limit] - Maximum amount of times to trim. No limit by default.
 * @returns - The processed string.
 */
export function trimSuffix(str: string, suffix: string, limit?: number): string {
  while (str.endsWith(suffix)) {
    if (limit !== undefined && limit <= 0) {
      break;
    }
    str = str.substring(0, str.length - suffix.length);
    if (limit) {
      limit -= 1;
    }
  }
  return str;
}
