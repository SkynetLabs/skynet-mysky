import type { Connection } from "post-me";
import { ChildHandshake, WindowMessenger } from "post-me";
import { RequestConfig } from "skynet-js";
import {
  deriveDiscoverableFileTweak,
  deriveEncryptedFileTweak,
  RegistryEntry,
  signEntry,
  SkynetClient,
  PUBLIC_KEY_LENGTH,
  PRIVATE_KEY_LENGTH,
  ExecuteRequestError,
} from "skynet-js";
import { CheckPermissionsResponse, PermCategory, Permission, PermType } from "skynet-mysky-utils";
import { sign } from "tweetnacl";

import { deriveRootPathSeed, genKeyPairFromSeed, hashWithSalt, sha512 } from "./crypto";
import { deriveEncryptedPathSeedForRoot } from "./encrypted_files";
import { login, logout, register } from "./portal_account";
import { launchPermissionsProvider } from "./provider";
import { SEED_LENGTH } from "./seed";
import { ActivePortalAccounts, getPortalAccounts, getUserSettings, PortalAccounts, setUserSettings } from "./user_data";
import { ALPHA_ENABLED, DEV_ENABLED, hexToUint8Array, log, readablePermission } from "./util";

export const SEED_STORAGE_KEY = "seed";
export const PORTAL_ACCOUNT_NICKNAME_STORAGE_KEY = "portal-account-nickname";

export const LOGIN_RESPONSE_KEY = "login-response";
export const PORTAL_ACCOUNT_LOGIN_RESPONSE_KEY = "portal-account-login-response";

export const INITIAL_PORTAL = "https://siasky.net";

// SALT_MESSAGE_SIGNING is the prefix with which we salt the data that MySky
// signs in order to be able to prove ownership of the MySky id.
const SALT_MESSAGE_SIGNING = "MYSKY_ID_VERIFICATION";

// Set `dev` based on whether we built production or dev.
let dev = false;
/// #if ENV == 'dev'
dev = true;
/// #endif

export type LoginResponse = {
  succeeded: boolean;
  portalAccountFound: boolean;
  error: string | null;
};

export type PortalAccountLoginResponse = {
  succeeded: boolean;
  error: string | null;
};

/**
 * Convenience class containing the permissions provider handshake connection
 * and worker handle.
 */
export class PermissionsProvider {
  /**
   * Creates the `PermissionsProvider`.
   *
   * @param connection - The handshake connection to the permissions provider.
   * @param worker - The permissiosn provider worker handle.
   */
  constructor(public connection: Connection, public worker: Worker) {}

  /**
   * Terminates the permissions provider worker script and then closes the
   * connection.
   */
  close() {
    this.worker.terminate();
    this.connection.close();
  }
}

// TODO: Rename to differentiate from `MySky` in SDK? Perhaps `MainMySky`.
/**
 * The class responsible for holding MySky-related data and connections and for
 * communicating with skapps and with the permissions provider.
 *
 * @property client - The associated SkynetClient.
 * @property mySkyDomain - The current domain of this MySky instance.
 * @property referrerDomain - The domain of the parent skapp.
 * @property parentConnection - The handshake connection with the parent window.
 * @property permissionsProvider - The permissions provider, if it has been loaded.
 */
export class MySky {
  protected parentConnection: Promise<Connection> | null = null;

  protected preferredPortal: string | null = null;
  protected portalAccountTweak: string | null = null;

  // ============
  // Constructors
  // ============

  /**
   * Creates the `MySky` instance.
   *
   * @param client - The Skynet client.
   * @param mySkyDomain - The current domain of this MySky instance.
   * @param referrerDomain - The domain that referred us here (i.e. of the host skapp).
   * @param permissionsProvider - The permissions provider, if it has been loaded.
   */
  constructor(
    protected client: SkynetClient,
    protected mySkyDomain: string,
    protected referrerDomain: string,
    protected permissionsProvider: Promise<PermissionsProvider> | null
  ) {}

  /**
   * Do the asynchronous parts of initialization here before calling the
   * constructor.
   *
   * NOTE: async is not allowed in constructors, which is why the work is split
   * up like this.
   *
   * For the preferred portal flow, see "Load MySky redirect flow" on
   * `redirectIfNotOnPreferredPortal` in the SDK.
   *
   * @returns - The `MySky` instance.
   * @throws - Will throw if the browser does not support web strorage.
   */
  static async initialize(): Promise<MySky> {
    log("Initializing...");

    if (typeof Storage === "undefined") {
      throw new Error("Browser does not support web storage");
    }
    if (!localStorage) {
      throw new Error("localStorage disabled");
    }

    // Check for the stored seed in localstorage.
    const seed = checkStoredSeed();

    // Launch the permissions provider if the seed was given.
    let permissionsProvider = null;
    if (seed) {
      permissionsProvider = launchPermissionsProvider(seed);
    }

    // Start with a client on siasky.net for when we get the user settings. If
    // the seed was not found, we can't get the user settings so just use the
    // current portal.
    const initialClient = getLoginClient(seed);

    const { currentDomain, referrerDomain } = await getCurrentAndReferrerDomains();
    if (!referrerDomain) {
      throw new Error("Referrer not found");
    }

    // Create MySky object.
    log("Calling new MySky()");
    const mySky = new MySky(initialClient, currentDomain, referrerDomain, permissionsProvider);

    // Login to portal.
    if (seed) {
      await mySky.setPreferredPortalAndLogin(seed);
    }

    // Set up the storage event listener, triggered when a seed is set in MySky
    // UI.
    mySky.setupStorageEventListener();

    // We are ready to accept requests. Set up the handshake connection.
    mySky.connectToParent();

    return mySky;
  }

  // ==========
  // Public API
  // ==========

  /**
   * Checks whether the user can be automatically logged in (the seed is present
   * and required permissions are granted).
   *
   * @param perms - The requested permissions.
   * @returns - Whether the seed is present and a list of granted and rejected permissions.
   */
  async checkLogin(perms: Permission[]): Promise<[boolean, CheckPermissionsResponse]> {
    log("Entered checkLogin");

    // Check for stored seed in localstorage.
    const seed = checkStoredSeed();
    if (!seed) {
      log("Seed not found");
      const permissionsResponse = { grantedPermissions: [], failedPermissions: perms };
      return [false, permissionsResponse];
    }

    // Load of permissions provider should have been triggered by now, either
    // when initiatializing MySky frame or when setting seed in MySky UI.
    if (!this.permissionsProvider) {
      throw new Error("Permissions provider not loaded");
    }

    // Check given permissions with the permissions provider.
    log("Calling checkPermissions");
    const provider = await this.permissionsProvider;
    const permissionsResponse: CheckPermissionsResponse = await provider.connection
      .remoteHandle()
      .call("checkPermissions", perms, dev);

    return [true, permissionsResponse];
  }

  /**
   * Checks whether the user can be automatically logged in to the portal (the
   * portal account tweak was found).
   *
   * @returns - Whether the email was found.
   */
  async checkPortalLogin(): Promise<boolean> {
    log("Entered checkPortalLogin");

    return this.portalAccountTweak !== null;
  }

  /**
   * Gets the encrypted path seed for the given path.
   *
   * @param path - The given file or directory path.
   * @param isDirectory - Whether the path corresponds to a directory.
   * @returns - The hex-encoded encrypted path seed.
   */
  async getEncryptedPathSeed(path: string, isDirectory: boolean): Promise<string> {
    log("Entered getEncryptedPathSeed");

    // Check with the permissions provider that we have permission for this request.
    await this.checkPermission(path, PermCategory.Hidden, PermType.Read);

    // Get the seed.
    const seed = checkStoredSeed();
    if (!seed) {
      throw new Error("User seed not found");
    }

    // Compute the root path seed.
    const rootPathSeedBytes = deriveRootPathSeed(seed);

    // Compute the child path seed.
    return deriveEncryptedPathSeedForRoot(rootPathSeedBytes, path, isDirectory);
  }

  /**
   * Gets the user's preferred portal, if set.
   *
   * @returns - The preferred portal, if set.
   */
  async getPreferredPortal(): Promise<string | null> {
    log("Entered getPreferredPortal");

    return this.preferredPortal;
  }

  // TODO: Logout from all tabs.
  /**
   * Logs out of MySky.
   */
  async logout(): Promise<void> {
    const errors = [];

    // Check if user is logged in.
    const seed = checkStoredSeed();

    if (seed) {
      // Clear the stored seed.
      clearStoredSeed();
    } else {
      errors.push(new Error("MySky user is already logged out"));
    }

    // Restore original `executeRequest`.
    this.client.customOptions.loginFn = undefined;

    // Clear the JWT cookie.
    //
    // NOTE: We do this even if we could not find a seed above. The local
    // storage might have been cleared with the JWT token still being active.
    //
    // NOTE: This will not auto-relogin on an expired JWT, just to logout again.
    // If we get a 401 error, we just return silently without throwing.
    try {
      log("Calling logout");
      await logout(this.client);
    } catch (e) {
      if ((e as ExecuteRequestError).responseStatus !== 401) {
        errors.push(e);
      }
    }

    // Throw all encountered errors.
    if (errors.length > 0) {
      throw new Error(`Error${errors.length > 1 ? "s" : ""} logging out: ${errors}`);
    }
  }

  /**
   * Tries to log in to the portal through MySky. Should be called by the SDK
   * whenever it detects an expired JWT.
   */
  async portalLogin(): Promise<void> {
    // Get the seed.
    const seed = checkStoredSeed();
    if (!seed) {
      throw new Error("User seed not found");
    }

    // Get the portal account tweak.
    const tweak = this.portalAccountTweak;
    if (!tweak) {
      throw new Error("Portal account not found");
    }

    await login(this.client, seed, tweak);
  }

  /**
   * Signs the given data using the MySky user's private key. This method can be
   * used for MySky user verification as the signature may be verified against
   * the user's public key, which is the MySky user id.
   *
   * NOTE: verifyMessageSignature is the counter part of this method, and
   * verifies an original message against the signature and the user's public
   * key
   *
   * NOTE: This function (internally) adds a salt to the given data array to
   * ensure there's no potential overlap with anything else, like registry
   * entries.
   *
   * @param message - message to sign
   * @returns signature
   */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    // fetch the user's seed
    const seed = checkStoredSeed();
    if (!seed) {
      throw new Error("User seed not found");
    }

    // fetch the private key and sanity check the length
    const { privateKey } = genKeyPairFromSeed(seed);
    if (!privateKey) {
      throw new Error("Private key not found");
    }
    if (privateKey.length !== PRIVATE_KEY_LENGTH) {
      throw new Error(`Private key had the incorrect length, ${privateKey.length}!=${PRIVATE_KEY_LENGTH}`);
    }

    // convert it to bytes
    const privateKeyBytes = hexToUint8Array(privateKey);
    if (!privateKeyBytes) {
      throw new Error("Private key was not properly hex-encoded");
    }

    // Prepend a salt to the message, essentially name spacing it so the
    // signature is only useful for MySky ID verification.
    const hash = hashWithSalt(message, SALT_MESSAGE_SIGNING);

    // Return the signature.
    return sign.detached(hash, privateKeyBytes);
  }

  /**
   * Signs the non-encrypted registry entry.
   *
   * @param entry - The non-encrypted registry entry.
   * @param path - The MySky path.
   * @returns - The signature.
   */
  async signRegistryEntry(entry: RegistryEntry, path: string): Promise<Uint8Array> {
    // Check that the entry data key corresponds to the right path.

    const dataKey = deriveDiscoverableFileTweak(path);
    if (entry.dataKey !== dataKey) {
      throw new Error("Path does not match the data key in the registry entry.");
    }

    return this.signRegistryEntryHelper(entry, path, PermCategory.Discoverable);
  }

  /**
   * Signs the encrypted registry entry.
   *
   * @param entry - The encrypted registry entry.
   * @param path - The MySky path.
   * @returns - The signature.
   */
  async signEncryptedRegistryEntry(entry: RegistryEntry, path: string): Promise<Uint8Array> {
    // Check that the entry data key corresponds to the right path.

    // Use `isDirectory: false` because registry entries can only correspond to files right now.
    const pathSeed = await this.getEncryptedPathSeed(path, false);
    const dataKey = deriveEncryptedFileTweak(pathSeed);
    if (entry.dataKey !== dataKey) {
      throw new Error("Path does not match the data key in the encrypted registry entry.");
    }

    return this.signRegistryEntryHelper(entry, path, PermCategory.Hidden);
  }

  /**
   * Returns the user ID (i.e. same as the user's public key).
   *
   * @returns - The hex-encoded user ID.
   */
  async userID(): Promise<string> {
    // Get the seed.
    const seed = checkStoredSeed();
    if (!seed) {
      throw new Error("User seed not found");
    }

    // Get the public key.
    const { publicKey } = genKeyPairFromSeed(seed);
    return publicKey;
  }

  /**
   * verifyMessageSignature verifies the signature for the message and given
   * public key and returns a boolean that indicates whether the verification
   * succeeded.
   *
   * @param message - the original message that was signed
   * @param signature - the signature
   * @param publicKey - the public key
   * @returns boolean that indicates whether the verification succeeded
   */
  async verifyMessageSignature(message: Uint8Array, signature: Uint8Array, publicKey: string): Promise<boolean> {
    // sanity check the public key length
    if (publicKey.length !== PUBLIC_KEY_LENGTH) {
      throw new Error(`Public key had the incorrect length, ${publicKey.length}!=${PUBLIC_KEY_LENGTH}`);
    }

    // convert it to bytes
    const publicKeyBytes = hexToUint8Array(publicKey);
    if (!publicKeyBytes) {
      throw new Error("Public key was not properly hex-encoded");
    }

    // reconstruct the original message
    const originalMessage = sha512(new Uint8Array([...sha512(SALT_MESSAGE_SIGNING), ...sha512(message)]));

    // verify the message against the signature and public key
    return sign.detached.verify(originalMessage, signature, publicKeyBytes);
  }

  // ================
  // Internal Methods
  // ================

  /**
   * Sets up the handshake connection with the parent.
   */
  protected connectToParent(): void {
    // Set child methods.

    const methods = {
      checkLogin: this.checkLogin.bind(this),
      checkPortalLogin: this.checkPortalLogin.bind(this),
      // NOTE: `getEncryptedFileSeed` was renamed to `getEncryptedPathSeed`, but
      // we still expose `getEncryptedFileSeed` in the API for backwards
      // compatibility.
      getEncryptedFileSeed: this.getEncryptedPathSeed.bind(this),
      getEncryptedPathSeed: this.getEncryptedPathSeed.bind(this),
      getPreferredPortal: this.getPreferredPortal.bind(this),
      logout: this.logout.bind(this),
      portalLogin: this.portalLogin.bind(this),
      signMessage: this.signMessage.bind(this),
      signRegistryEntry: this.signRegistryEntry.bind(this),
      signEncryptedRegistryEntry: this.signEncryptedRegistryEntry.bind(this),
      userID: this.userID.bind(this),
      verifyMessageSignature: this.verifyMessageSignature.bind(this),
    };

    // Enable communication with connector in parent skapp.

    log("Performing handshake");
    const messenger = new WindowMessenger({
      localWindow: window,
      remoteWindow: window.parent,
      remoteOrigin: "*",
    });
    this.parentConnection = ChildHandshake(messenger, methods);
  }

  // TODO: remove Promise.any polyfill.
  // /**
  //  * Connects to a portal account by either registering or logging in to an
  //  * existing account. The resulting cookie will be set on the MySky domain.
  //  *
  //  * NOTE: We will register "auto re-login" in a separate function.
  //  *
  //  * @param seed - The user seed.
  //  * @param email - The user email.
  //  */
  // protected async connectToPortalAccount(seed: Uint8Array, email: string): Promise<void> {
  //   log("Entered connectToPortalAccount");

  //   // Try to connect to the portal account and set the JWT cookie.
  //   //
  //   // Make requests to login and register in parallel. At most one can succeed,
  //   // and this saves a lot of time.
  //   try {
  //     await Promise.any([register(this.client, seed, email), login(this.client, seed, email)]);
  //   } catch (err) {
  //     const errors = (err as AggregateError).errors;
  //     throw new Error(`Could not register or login: [${errors}]`);
  //   }
  // }

  /**
   * Accesses user settings, sets the preferred portal if found, and tries to
   * log into a poral account on the current portal.
   *
   * @param seed - The user seed.
   * @returns - Whether we found and logged in with a tweak.
   */
  protected async setPreferredPortalAndLogin(seed: Uint8Array): Promise<boolean> {
    log("Entered loginFromUi");

    // Get user data.
    const [{ preferredPortal, activePortalAccounts }, portalAccounts] = await Promise.all([
      getUserSettings(this.client, seed, this.mySkyDomain),
      getPortalAccounts(this.client, seed, this.mySkyDomain),
    ]);

    // Set the portal. Will use the current portal if a preferred one was not
    // found.
    this.setPortal(preferredPortal);

    const portalAccountTweak = await this.getPortalAccountTweak(activePortalAccounts, portalAccounts);

    if (portalAccountTweak) {
      // If a tweak was found, try to connect to a portal account.
      await this.loginWithTweak(seed, portalAccountTweak);

      return true;
    }

    return false;
  }

  /**
   * Gets the tweak for the active portal account for the current portal, if one
   * is found.
   *
   * @param activePortalAccounts - The active portal accounts, for each known portal.
   * @param portalAccounts - The map of portal accounts to tweaks, for each known portal.
   * @returns - The tweak for the active portal account for the current portal.
   */
  protected async getPortalAccountTweak(
    activePortalAccounts: ActivePortalAccounts | null,
    portalAccounts: PortalAccounts
  ): Promise<string | null> {
    if (!activePortalAccounts) {
      return null;
    }

    // Get the active portal account.
    const currentPortalUrl = await this.client.portalUrl();
    const portalAccountSettings = activePortalAccounts[currentPortalUrl];
    const activeAccountNickname: string | null = portalAccountSettings.activeAccountNickname;

    // Set up auto-relogin if a portal account was found.
    if (activeAccountNickname) {
      return portalAccounts[currentPortalUrl][activeAccountNickname].tweak;
    }

    return null;
  }

  /**
   * Tries to login to the user's portal account with the given tweak.
   *
   * @param seed - The user seed.
   * @param portalAccountTweak - The portal account tweak, found in user data.
   */
  protected async loginWithTweak(seed: Uint8Array, portalAccountTweak: string): Promise<void> {
    // TODO: If we are initializing MySky, then don't try to login?
    await login(this.client, seed, portalAccountTweak);

    this.portalAccountTweak = portalAccountTweak;

    // Set up auto re-login on JWT expiry.
    this.setupAutoRelogin(seed, portalAccountTweak);
  }

  /**
   * Sets the portal, either the preferred portal if given or the current portal
   * otherwise.
   *
   * @param preferredPortal - The user's preferred portal
   */
  protected setPortal(preferredPortal: string | null): void {
    log(`Entered setPortal with portal: ${preferredPortal}`);

    if (preferredPortal) {
      // Connect to the preferred portal if it was found.
      this.client = new SkynetClient(preferredPortal);
      this.preferredPortal = preferredPortal;
    } else {
      // Else, connect to the current portal as opposed to siasky.net.
      this.client = new SkynetClient();
    }
  }

  /**
   * Sets up auto re-login. It registers a login function on the client which
   * runs when a request fails with `401 Unauthorized Response`. If so, it will
   * try to login with the login function and make the request again.
   *
   * NOTE: We will not throw an error on the first 401, instead trying to login
   * silently. There is no way for the client to know whether the cookie is set
   * ahead of time, and an error would not be actionable. Subsequent 401s will
   * result in an error being thrown.
   *
   * NOTE: We remove the registered login function on logout.
   *
   * @param seed - The user seed.
   * @param email - The user email.
   * @throws - Will throw if auto-login is already set up.
   */
  protected setupAutoRelogin(seed: Uint8Array, email: string): void {
    log("Entered setupAutoRelogin");

    if (this.client.customOptions.loginFn) {
      throw new Error("Tried to setup auto re-login with it already being set up");
    }

    this.client.customOptions.loginFn = async (_: RequestConfig) => {
      await login(this.client, seed, email);
    };
  }

  /**
   * Set up a listener for the storage event. Triggered when the seed is set
   * (see `handleSeedStorageKey`).
   */
  protected setupStorageEventListener(): void {
    log("Entered setupStorageEventListener");

    window.addEventListener("storage", async ({ key, newValue }: StorageEvent) => {
      log(`Entered storage event listener with key '${key}'`);

      if (key === SEED_STORAGE_KEY) {
        await this.handleSeedStorageKey(newValue);
      } else if (key === PORTAL_ACCOUNT_NICKNAME_STORAGE_KEY) {
        await this.handlePortalAccountNicknameStorageKey(newValue);
      }
    });
  }

  /**
   * Logs in to MySky using the seed sent from the UI through local storage.
   *
   * Flow:
   *
   * 0. Unload the permissions provider and seed if stored. (Done in
   * `setupStorageEventListener`.)
   *
   * 1. Always use siasky.net first.
   *
   * 2. Get the preferred portal and switch to it (`setPortal`), or if not found
   * switch to current portal.
   *
   * 3. If we got an active portal account, then we login to set the JWT cookie.
   *
   * 4. If the active portal account is set, it should set up automatic re-login
   * on JWT cookie expiry.
   *
   * 5. Trigger a load of the permissions provider.
   *
   * First unloads the permission provider to disable MySky functionality until
   * the permission provider is loaded again at the end.
   *
   * For the preferred portal flow, see "Load MySky redirect flow" on
   * `redirectIfNotOnPreferredPortal` in the SDK.
   */
  protected async handleSeedStorageKey(newValue: string | null): Promise<void> {
    if (this.permissionsProvider) {
      // Unload the old permissions provider first. This makes sure that MySky
      // can't respond to more requests until the new permissions provider is
      // loaded at the end of this function.
      await this.permissionsProvider.then((provider) => provider.close());
      this.permissionsProvider = null;
    }

    if (!newValue) {
      // Seed was removed.
      return;
    }

    // Clear any existing value to make sure the storage event is triggered
    // when we set the key.
    localStorage.removeItem(LOGIN_RESPONSE_KEY);

    let response: LoginResponse = { succeeded: false, portalAccountFound: false, error: null };
    try {
      // Parse the seed.
      const seed = new Uint8Array(JSON.parse(newValue));

      // Connect to siasky.net first.
      //
      // NOTE: We should always have a seed here, so this always uses the initial
      // portal (siasky.net).
      this.client = getLoginClient(seed);

      const portalAccountFound = await this.setPreferredPortalAndLogin(seed);
      response.portalAccountFound = portalAccountFound;

      // Launch the new permissions provider.
      this.permissionsProvider = launchPermissionsProvider(seed);

      // Signal to MySky UI that we are done.
      response.succeeded = true;
    } catch (e) {
      log(`Error in storage event listener: ${e}`);

      // Send error to MySky UI.
      response.error = (e as Error).message;
    }

    localStorage.setItem(LOGIN_RESPONSE_KEY, JSON.stringify(response));
  }

  protected async handlePortalAccountNicknameStorageKey(newValue: string | null): Promise<void> {
    if (!newValue) {
      // Nickname was removed.
      return;
    }

    // Clear any existing value to make sure the storage event is triggered
    // when we set the key.
    localStorage.removeItem(LOGIN_RESPONSE_KEY);

    let response: PortalAccountLoginResponse = { succeeded: false, error: null };

    // TODO: Try to login to the portal account.
    try {
      await this.connectToPortalAccount(newValue);

      // Signal to MySky UI that we are done.
      response.succeeded = true;
    } catch (e) {
      log(`Error in storage event listener: ${e}`);

      // Send error to MySky UI.
      response.error = (e as Error).message;
    }

    localStorage.setItem(LOGIN_RESPONSE_KEY, JSON.stringify(response));
  }

  /**
   * Helper for `signRegistryEntry*` methods. This is where we check for
   * permissions and do the signing.
   *
   * @param entry - The encrypted registry entry.
   * @param path - The MySky path.
   * @param category - The permission category.
   * @returns - The signature.
   */
  protected async signRegistryEntryHelper(
    entry: RegistryEntry,
    path: string,
    category: PermCategory
  ): Promise<Uint8Array> {
    log("Entered signRegistryEntryHelper");

    // Check with the permissions provider that we have permission for this request.
    await this.checkPermission(path, category, PermType.Write);

    // Get the seed.
    const seed = checkStoredSeed();
    if (!seed) {
      throw new Error("User seed not found");
    }

    // Get the private key.
    const { privateKey } = genKeyPairFromSeed(seed);

    // Sign the entry.
    const signature = await signEntry(privateKey, entry, true);

    return signature;
  }

  /**
   * Checks for permission for the given path, permission category, and
   * permission type.
   *
   * @param path - The MySky path.
   * @param category - The permission category.
   * @param permType - The permission type.
   * @throws - Will throw if the user doesn't have the required permission.
   */
  protected async checkPermission(path: string, category: PermCategory, permType: PermType): Promise<void> {
    // Check for the permissions provider.
    if (!this.permissionsProvider) {
      throw new Error("Permissions provider not loaded");
    }

    const perm = new Permission(this.referrerDomain, path, category, permType);
    log(`Checking permission: ${JSON.stringify(perm)}`);
    const provider = await this.permissionsProvider;
    const resp: CheckPermissionsResponse = await provider.connection
      .remoteHandle()
      .call("checkPermissions", [perm], dev);
    if (resp.failedPermissions.length > 0) {
      const readablePerm = readablePermission(perm);
      throw new Error(`Permission was not granted: ${readablePerm}`);
    }
  }
}

// =======
// Helpers
// =======

/**
 * Checks for seed stored in local storage from previous sessions.
 *
 * @returns - The seed, or null if not found.
 */
export function checkStoredSeed(): Uint8Array | null {
  log("Entered checkStoredSeed");

  const seedStr = localStorage.getItem(SEED_STORAGE_KEY);
  if (!seedStr) {
    return null;
  }

  // If we can't make a uint8 array out of the stored value, clear it and return null.
  let seed;
  try {
    const arr = JSON.parse(seedStr);
    seed = new Uint8Array(arr);
    if (seed.length !== SEED_LENGTH) {
      throw new Error("Bad seed length");
    }
  } catch (err) {
    log(`Error getting stored seed: ${err as string}`);
    clearStoredSeed();
    return null;
  }

  return seed;
}

/**
 * Clears the seed stored in local storage.
 */
export function clearStoredSeed(): void {
  log("Entered clearStoredSeed");

  localStorage.removeItem(SEED_STORAGE_KEY);
}

/**
 * Gets the current and referrer domains.
 *
 * @returns - The current and referrer domains.
 */
export async function getCurrentAndReferrerDomains(): Promise<{
  currentDomain: string;
  referrerDomain: string | null;
}> {
  // Get the MySky domain (i.e. `skynet-mysky.hns or sandbridge.hns`). Use
  // hard-coded values since we don't expect official MySky to be hosted
  // anywhere else for now.
  let currentDomain;
  if (ALPHA_ENABLED && DEV_ENABLED) {
    throw new Error("Alpha and dev modes cannot both be enabled");
  } else if (ALPHA_ENABLED) {
    currentDomain = "sandbridge.hns";
  } else if (DEV_ENABLED) {
    currentDomain = "skynet-mysky-dev.hns";
  } else {
    currentDomain = "skynet-mysky.hns";
  }

  // Get the referrer and MySky domains.
  // Extract skapp domain from actual portal.
  // NOTE: The skapp should have opened MySky on the same portal as itself.
  let referrerDomain = null;
  if (document.referrer) {
    const referrerClient = new SkynetClient(document.referrer);
    const referrerUrlObj = new URL(document.referrer);
    referrerDomain = await referrerClient.extractDomain(referrerUrlObj.hostname);
  }

  // Sanity check that the current domain as extracted from the URL is
  // equivalent to the hard-coded domain we got above.
  {
    const actualPortalClient = new SkynetClient();
    // Extract the MySky domain from the current URL.
    const currentDomainExtracted = await actualPortalClient.extractDomain(window.location.hostname);
    if (currentDomainExtracted !== currentDomain) {
      throw new Error(
        `Extracted current domain '${currentDomainExtracted}' is different from the expected domain '${currentDomain}'`
      );
    }
  }

  return { currentDomain, referrerDomain };
}

/**
 * Initialize the Skynet client.
 *
 * Connect to siasky.net if the seed was found, otherwise connect to the current
 * portal.
 *
 * @param seed - The user seed, if given.
 * @param preferredPortal - The user's preferred portal, if found.
 * @returns - The Skynet client to be used for logging in to the portal.
 */
function getLoginClient(seed: Uint8Array | null): SkynetClient {
  log("Entered getLoginClient");

  const initialPortal = seed ? INITIAL_PORTAL : undefined;
  return new SkynetClient(initialPortal);
}
