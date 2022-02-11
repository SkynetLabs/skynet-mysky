import { Connection, ParentHandshake, WorkerMessenger } from "post-me";
import { defaultHandshakeAttemptsInterval, defaultHandshakeMaxAttempts, ensureUrl } from "skynet-mysky-utils";
import { PermissionsProvider } from "./mysky";
import { log } from "./util";

export const relativePermissionsWorkerUrl = "permissions.js";
export const relativePermissionsDisplayUrl = "permissions-display.html";
export const defaultSeedDisplayProvider = "seed-display.html";

const _permissionsProviderPreferencePath = "permissions-provider.json";

export type SeedProviderAction = "signin" | "signup";

/**
 * The response returned by the seed provider to the UI.
 *
 * @property seed - The user seed.
 * @property email - The user email.
 * @property action - The user action.
 */
export type SeedProviderResponse = {
  seed: Uint8Array;
  email: string | null;
  action: SeedProviderAction;
};

// TODO: Either remove, or fully implement if we still want to have custom
// permissions providers. This is from when we decided that users can choose
// their own permissions providers, but we didn't yet have a way to access/save
// user settings.
/**
 * Tries to get the saved permissions provider preference, returning the default provider if not found.
 *
 * @param _seed - The user seed as bytes.
 * @returns - The permissions provider URL.
 */
export async function getPermissionsProviderUrl(_seed: Uint8Array): Promise<string> {
  // Derive the user.
  // const { publicKey } = genKeyPairFromSeed(seed);

  // Check the user's saved preferences from hidden file.

  // TODO
  // const { preference } = this.getJSONHidden(permissionsProviderPreferencePath);

  return ensureUrl(window.location.hostname);
}

/**
 * Launches the user's permissions provider if set, or the default provider.
 *
 * @param seed - The user seed as bytes.
 * @returns - The handshake connection with the provider.
 */
export async function launchPermissionsProvider(seed: Uint8Array): Promise<PermissionsProvider> {
  log("Entered launchPermissionsProvider");

  const permissionsProviderUrl = await getPermissionsProviderUrl(seed);

  // NOTE: This URL must obey the same-origin policy. If not the default permissions provider, it can be a base64 skylink on the current origin.
  const workerJsUrl = `${permissionsProviderUrl}/${relativePermissionsWorkerUrl}`;

  // Load the worker.

  const worker = new Worker(workerJsUrl);
  const messenger = new WorkerMessenger({ worker });
  // TODO: Pass custom handshake options?
  const connection = ParentHandshake(messenger, {}, defaultHandshakeMaxAttempts, defaultHandshakeAttemptsInterval);

  // Return the worker and terminate it when not needed.
  return await connection.then((connection: Connection) => new PermissionsProvider(connection, worker));
}
