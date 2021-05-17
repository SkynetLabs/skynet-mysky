import { Connection, ParentHandshake, WindowMessenger, WorkerMessenger } from "post-me";
import {
  createIframe,
  defaultHandshakeAttemptsInterval,
  defaultHandshakeMaxAttempts,
  ensureUrl,
} from "skynet-mysky-utils";
import { genKeyPairFromSeed } from "./util";

export const relativePermissionsProviderUrl = "permissions.html";
export const relativePermissionsDisplayUrl = "permissions-display.html";
export const defaultSeedDisplayProvider = "seed-display.html";

const permissionsProviderPreferencePath = "permissions-provider.json";

/**
 * Tries to get the saved permissions provider preference, returning the default provider if not found.
 *
 * @param seed
 */
export async function getPermissionsProviderUrl(seed: Uint8Array): Promise<string> {
  // Derive the user.
  const { publicKey } = genKeyPairFromSeed(seed);

  // Check the user's saved preferences from hidden file.

  // TODO
  const preference: string | null = null;
  // const { preference } = this.getJSONHidden(permissionsProviderPreferencePath);

  return ensureUrl(window.location.hostname);
}

/**
 * @param seed
 */
export async function launchPermissionsProvider(seed: Uint8Array): Promise<Connection> {
  console.log("Entered launchPermissionsProvider");

  const permissionsProviderUrl = await getPermissionsProviderUrl(seed);

  const providerUrl = `${permissionsProviderUrl}/${relativePermissionsProviderUrl}`;

  // Load the frame.

  const childFrame = createIframe(providerUrl, providerUrl);
  const childWindow = childFrame.contentWindow!;

  // Complete handshake with Provider Display window.

  const messenger = new WindowMessenger({
    localWindow: window,
    remoteWindow: childWindow,
    remoteOrigin: "*",
  });
  // TODO: Pass custom handshake options?
  return await ParentHandshake(messenger, {}, defaultHandshakeMaxAttempts, defaultHandshakeAttemptsInterval);
}
