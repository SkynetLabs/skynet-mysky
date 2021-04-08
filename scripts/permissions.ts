// Make Typescript happy, requires "lib": ["webworker"].
declare const self: DedicatedWorkerGlobalScope;

import { ChildHandshake, WorkerMessenger } from "post-me";
import type { Connection } from "post-me";
import { CheckPermissionsResponse, Permission } from "skynet-mysky-utils";

let parentConnection: Connection | null = null;

// ==========
// Core Logic
// ==========

async function checkPermissions(perms: Permission[]): Promise<CheckPermissionsResponse> {
  const grantedPermissions = [];
  const failedPermissions = [];

  for (let perm of perms) {
    if (perm.requestor === perm.path.split("/")[0]) {
      grantedPermissions.push(perm);
    } else {
      failedPermissions.push(perm);
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
