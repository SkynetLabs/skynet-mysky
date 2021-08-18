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
})();

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
// Public API
// ==========

export async function checkPermissions(perms: Permission[], dev = false): Promise<CheckPermissionsResponse> {
  if (!dev) {
    // Check the version and clear old permissions if we've updated the permission storage scheme.
    await checkVersion();
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

export async function setPermissions(grantedPermissions: Permission[]): Promise<void> {
  // Check the version and clear old permissions if we've updated the permission storage scheme.
  await checkVersion();

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
async function checkVersion(): Promise<void> {
  // Get the version.
  const oldVersion = await get(versionKey);

  // Clear old permissions if we're on a new version.
  if (!oldVersion || oldVersion < version) {
    clear();
  }

  // Set the latest version.
  await set(versionKey, version);
}

async function fetchPermission(perm: Permission): Promise<boolean> {
  const key = createPermissionKey(perm.requestor, perm.path);
  const storedBitfield = await get(key);
  if (!storedBitfield) {
    return false;
  }
  const bitfieldToCheck = createPermissionBitfield(perm.category, perm.permType);
  return (storedBitfield & bitfieldToCheck) > 0;
}

async function savePermission(perm: Permission): Promise<void> {
  const key = createPermissionKey(perm.requestor, perm.path);
  const bitfieldToAdd = createPermissionBitfield(perm.category, perm.permType);
  await update(key, (storedBitfield: number | undefined) => (storedBitfield || 0) | bitfieldToAdd);
}

// =======
// Helpers
// =======

function createPermissionBitfield(category: number, permType: number): number {
  // Reserve space for 16 perm types.
  const bit = (category - 1) * 16 + permType;
  return 1 << bit;
}

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
