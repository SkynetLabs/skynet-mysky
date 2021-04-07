// Make Typescript happy, requires "lib": ["webworker"].
declare const self: DedicatedWorkerGlobalScope;

import { ChildHandshake, WorkerMessenger } from "post-me";
import { CheckPermissionsResponse, Permission } from "skynet-mysky-utils";

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

const messenger = new WorkerMessenger({ worker: self });
const parentConnection = ChildHandshake(messenger, methods);

// ======
// Events
// ======

self.onerror = async function (error: any) {
  console.log(error);
  if (parentConnection) {
    const connection = await parentConnection;
    if (typeof error === "string") {
      await connection.remoteHandle().call("catchError", error);
    } else {
      await connection.remoteHandle().call("catchError", error.type);
    }
  }
};
