declare const self: DedicatedWorkerGlobalScope;

import { ChildHandshake, WorkerMessenger } from 'post-me';
import { Permission } from "skynet-interface-utils";

async function checkPermissions(perms: Permission[]): Promise<Permission[]> {
  const failedPermissions = [];

  for (let perm of perms) {
    if (perm.requestor !== perm.path.split("/")[0]) {
      failedPermissions.push(perm);
    }
  }

  return failedPermissions;
}

const methods = {
  checkPermissions,
}

const messenger = new WorkerMessenger({worker: self});
ChildHandshake(messenger, methods);
