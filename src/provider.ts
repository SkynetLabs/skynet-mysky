import { Connection, ParentHandshake, WorkerMessenger } from "post-me";
import { genKeyPairFromSeed } from "skynet-js";

const defaultPermissionsProvider = "permissions.js";
const permissionsProviderPreferencePath = "skynet-mysky.hns/permissions-provider.json";
export const defaultSeedDisplayProvider = "seed.html";

export async function loadPermissionsProvider(seed: string): Promise<Connection> {
  // Derive the user.
  const { publicKey } = genKeyPairFromSeed(seed);

  // Check the user's saved preferences from hidden file.

  // TODO
  const preference: string | null = null;
  // const { preference } = this.getJSONHidden(permissionsProviderPreferencePath);

  // If no saved preference, use the default permissions provider.

  let workerJsUrl;
  if (!preference) {
    workerJsUrl = defaultPermissionsProvider;
  } else {
    workerJsUrl = preference;
  }

  // Load the worker.

  const worker = new Worker(workerJsUrl);
  const messenger = new WorkerMessenger({ worker });
  // TODO: Pass custom handshake options?
  return await ParentHandshake(messenger);
}
