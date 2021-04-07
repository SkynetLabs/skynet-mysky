// Make Typescript happy, requires "lib": ["webworker"].
declare const self: DedicatedWorkerGlobalScope;

import { ChildHandshake, WorkerMessenger } from "post-me";
import { CheckPermissionsResponse, Permission } from "skynet-mysky-utils";

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

const methods = {
  checkPermissions,
};

const messenger = new WorkerMessenger({ worker: self });
ChildHandshake(messenger, methods);
