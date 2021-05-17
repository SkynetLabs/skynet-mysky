import { ChildHandshake, WindowMessenger } from "post-me";
import type { Connection } from "post-me";
import {
  CheckPermissionsResponse,
  getParentPath,
  getPathDomain,
  Permission,
  sanitizePath,
  trimSuffix,
} from "skynet-mysky-utils";

let parentConnection: Connection | null = null;

// ==============
// Initialization
// ==============

/**
 *
 */
async function init() {
  // Establish handshake with parent window.

  const messenger = new WindowMessenger({
    localWindow: window,
    remoteWindow: window.parent,
    remoteOrigin: "*",
  });
  const methods = {
    checkPermissions,
    setPermissions,
  };
  parentConnection = await ChildHandshake(messenger, methods);
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

// Code that runs on page load.
window.onload = async () => {
  await init();
};

// ==========
// Public API
// ==========

/**
 * @param perms
 * @param dev
 */
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

/**
 * @param grantedPermissions
 */
export async function setPermissions(grantedPermissions: Permission[]): Promise<void> {
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
 * @param perm
 */
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
 * @param perm
 */
async function fetchPermission(perm: Permission): Promise<boolean> {
  const key = createPermissionKey(perm.requestor, perm.path);
  const storedBitfield = await getStorage(key);
  if (!storedBitfield) {
    return false;
  }
  const bitfieldToCheck = (1 << perm.category) | (1 << perm.permType);
  return (JSON.parse(storedBitfield) & bitfieldToCheck) > 0;
}

/**
 * @param perm
 */
async function savePermission(perm: Permission): Promise<void> {
  const key = createPermissionKey(perm.requestor, perm.path);
  const bitfieldToAdd = (1 << perm.category) | (1 << perm.permType);
  await updateStorage(
    key,
    (storedBitfield: string | null) => ((storedBitfield && JSON.parse(storedBitfield)) || 0) | bitfieldToAdd
  );
}

/**
 * @param requestor
 * @param path
 */
export function createPermissionKey(requestor: string, path: string): string {
  requestor = trimSuffix(requestor, "/");
  path = sanitizePath(path);
  return `perm-[${requestor}],[${path}]`;
}

// =======
// Helpers
// =======

/**
 * @param key
 */
async function getStorage(key: string): Promise<string | null> {
  return localStorage.getItem(key);
}

/**
 * @param key
 * @param updateFn
 */
async function updateStorage(key: string, updateFn: (storedValue: string | null) => unknown): Promise<void> {
  const storedValue = localStorage.getItem(key);
  const newValue = updateFn(storedValue);
  localStorage.setItem(key, JSON.stringify(newValue));
}
