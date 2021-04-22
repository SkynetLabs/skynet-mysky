import { Connection, ParentHandshake, WorkerMessenger } from "post-me";
import { genKeyPairFromSeed } from "skynet-js";
import { defaultHandshakeAttemptsInterval, defaultHandshakeMaxAttempts, ensureUrl } from "skynet-mysky-utils";

export const relativePermissionsWorkerUrl = "permissions.js";
export const relativePermissionsDisplayUrl = "permissions-display.html";
export const defaultSeedDisplayProvider = "seed-display.html";

const permissionsProviderPreferencePath = "permissions-provider.json";

/**
 * Tries to get the saved permissions provider preference, returning the default provider if not found.
 */
export async function getPermissionsProviderUrl(seed: string): Promise<string> {
  // Derive the user.
  const { publicKey } = genKeyPairFromSeed(seed);

  // Check the user's saved preferences from hidden file.

  // TODO
  const preference: string | null = null;
  // const { preference } = this.getJSONHidden(permissionsProviderPreferencePath);

  return ensureUrl(window.location.hostname);
}

export async function launchPermissionsProvider(seed: string): Promise<Connection> {
  console.log("Entered launchPermissionsProvider");

  const permissionsProviderUrl = await getPermissionsProviderUrl(seed);

  // NOTE: This URL must obey the same-origin policy. If not the default permissions provider, it can be a base64 skylink on the current origin.
  const workerJsUrl = `${permissionsProviderUrl}/${relativePermissionsWorkerUrl}`;

  // Load the worker.

  // TODO: Return the worker and terminate it when not needed?
  const worker = new Worker(workerJsUrl);
  const messenger = new WorkerMessenger({ worker });
  // TODO: Pass custom handshake options?
  return await ParentHandshake(messenger, {}, defaultHandshakeMaxAttempts, defaultHandshakeAttemptsInterval);
}
