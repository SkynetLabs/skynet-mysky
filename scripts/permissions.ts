// Make Typescript happy, requires "lib": ["webworker"].
declare const self: DedicatedWorkerGlobalScope;

import { ChildHandshake, WorkerMessenger } from "post-me";
import type { Connection } from "post-me";
import { CheckPermissionsResponse, Permission } from "skynet-mysky-utils";

let parentConnection: Connection | null = null;

// ==========
// Core Logic
// ==========

export async function checkPermissions(perms: Permission[], dev = false): Promise<CheckPermissionsResponse> {
  const grantedPermissions = [];
  const failedPermissions = [];

  // If in dev mode, allow all permissions.
  if (dev) {
    grantedPermissions.push(...perms);
  } else {
    for (let perm of perms) {
      const requestor = trimSuffix(perm.requestor, "/");
      const path = perm.path.split("/")[0];
      if (requestor === path) {
        grantedPermissions.push(perm);
      } else {
        failedPermissions.push(perm);
      }
    }
  }

  return { grantedPermissions, failedPermissions };
}

// ==============
// Initialization
// ==============

const methods = {
  checkPermissions,
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

// =======
// Helpers
// =======

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
