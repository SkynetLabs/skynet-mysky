import { SkynetClient } from "skynet-js";

import { getJSONEncryptedInternal, setJSONEncryptedInternal } from "./skydb_internal";
import { log } from "./util";

/**
 * Settings associated with a user's MySky account.
 *
 * @property portal - The user's preferred portal. We redirect a skapp to this portal, if it is set.
 * @property email - The user's portal account email. We connect to their portal account if this is set.
 */
type UserSettings = { portal: string | null; email: string | null };

/**
 * Checks for the preferred portal and stored email in user settings, and sets
 * them if found.
 *
 * @param client - The Skynet client.
 * @param seed - The root MySky user seed.
 * @param mySkyDomain - The domain of the current MySky instance.
 * @returns - The portal and email, if found.
 */
export async function getUserSettings(
  client: SkynetClient,
  seed: Uint8Array,
  mySkyDomain: string
): Promise<UserSettings> {
  log("Entered getUserSettings");

  let email = null,
    portal = null;

  // Get the settings path for the MySky domain.
  const path = getUserSettingsPath(mySkyDomain);

  // Check for stored portal and email in user settings.
  const { data: userSettings } = await getJSONEncryptedInternal(client, seed, path);
  if (userSettings) {
    email = (userSettings.email as string) || null;
    portal = (userSettings.portal as string) || null;
  }

  return { portal, email };
}

/**
 * Sets the user settings.
 *
 * @param client - The Skynet client.
 * @param seed - The root MySky user seed.
 * @param mySkyDomain - The domain of the current MySky instance.
 * @param settings - The given user settings.
 */
export async function setUserSettings(
  client: SkynetClient,
  seed: Uint8Array,
  mySkyDomain: string,
  settings: UserSettings
): Promise<void> {
  log("Entered setUserSettings");

  // Get the settings path for the MySky domain.
  const path = getUserSettingsPath(mySkyDomain);

  // Set preferred portal and email in user settings.
  await setJSONEncryptedInternal(client, seed, path, settings);
}

/**
 * Get the path to the user settings stored in the root MySky domain.
 *
 * @param mySkyDomain - The domain of the current MySky instance.
 * @returns - The user settings path.
 */
function getUserSettingsPath(mySkyDomain: string): string {
  return `${mySkyDomain}/settings.json`;
}
