/**
 * @file User data types and functions.
 *
 * User data is comprised of:
 *   - User settings
 */

import { SkynetClient } from "skynet-js";

import { getJSONEncryptedInternal, setJSONEncryptedInternal } from "./skydb_internal";
import { log } from "./util";

// ================
// Type Definitions
// ================

/**
 * Settings associated with a user's MySky account.
 *
 * @property preferredPortal - The user's preferred portal. We redirect a skapp to this portal, if it is set.
 * @property portalAccounts - For each known portal, stores the active nickname.
 */
type UserSettings = {
  preferredPortal: string | null;
  activePortalAccounts: ActivePortalAccounts | null;
};

export type ActivePortalAccounts = {
  [portal: string]: {
    activeAccountNickname: string | null;
  };
};

export type PortalAccounts = {
  [portal: string]: {
    [accountNickname: string]: { tweak: string };
  };
};

// =============
// User Settings
// =============

/**
 * Returns the user settings.
 *
 * @param client - The Skynet client.
 * @param seed - The root MySky user seed.
 * @param mySkyDomain - The domain of the current MySky instance.
 * @returns - The user settings, if found.
 */
export async function getUserSettings(
  client: SkynetClient,
  seed: Uint8Array,
  mySkyDomain: string
): Promise<UserSettings> {
  log("Entered getUserSettings");

  // Get the settings path for the MySky domain.
  const path = getUserSettingsPath(mySkyDomain);

  // Check for stored user settings.
  const { data } = await getJSONEncryptedInternal(client, seed, path);
  return {
    preferredPortal: (data?.preferredPortal || null) as string | null,
    activePortalAccounts: (data?.portalAccounts || null) as ActivePortalAccounts | null,
  };
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

// ===============
// Portal Accounts
// ===============

/**
 * Returns the portal accounts and associated tweaks.
 *
 * @param client - The Skynet client.
 * @param seed - The root MySky user seed.
 * @param mySkyDomain - The domain of the current MySky instance.
 * @returns - The portal accounts, if found.
 */
export async function getPortalAccounts(
  client: SkynetClient,
  seed: Uint8Array,
  mySkyDomain: string
): Promise<PortalAccounts> {
  log("Entered getPortalAccounts");

  // Get the portal accounts path for the MySky domain.
  const path = getPortalAccountsPath(mySkyDomain);

  // Check for stored portal accounts.
  const { data } = await getJSONEncryptedInternal(client, seed, path);
  return (data || {}) as PortalAccounts;
}

/**
 * Sets the portal accounts.
 *
 * @param client - The Skynet client.
 * @param seed - The root MySky user seed.
 * @param mySkyDomain - The domain of the current MySky instance.
 * @param portalAccounts - The given portal accounts.
 */
export async function setPortalAccounts(
  client: SkynetClient,
  seed: Uint8Array,
  mySkyDomain: string,
  portalAccounts: PortalAccounts
): Promise<void> {
  log("Entered setPortalAccounts");

  // Get the portal accounts path for the MySky domain.
  const path = getPortalAccountsPath(mySkyDomain);

  // Set portal accounts.
  await setJSONEncryptedInternal(client, seed, path, portalAccounts);
}

// =======
// Helpers
// =======

/**
 * Get the path to the portal accounts and associated tweaks stored in the root
 * MySky domain.
 *
 * @param mySkyDomain - The domain of the current MySky instance.
 * @returns - The portal accounts path.
 */
function getPortalAccountsPath(mySkyDomain: string): string {
  return `${mySkyDomain}/portal-accounts.json`;
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