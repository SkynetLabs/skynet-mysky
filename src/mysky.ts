import type { Connection } from "post-me";
import { ChildHandshake, WindowMessenger } from "post-me";
import {
  decryptJSONFile,
  deriveDiscoverableFileTweak,
  deriveEncryptedFileTweak,
  encryptJSONFile,
  ENCRYPTED_JSON_RESPONSE_VERSION,
  getOrCreateSkyDBRegistryEntry,
  RegistryEntry,
  signEntry,
  SkynetClient,
  PUBLIC_KEY_LENGTH,
  PRIVATE_KEY_LENGTH,
  ExecuteRequestError,
  JsonData,
  deriveEncryptedFileKeyEntropy,
  EncryptedJSONResponse,
  MAX_REVISION,
} from "skynet-js";

import { CheckPermissionsResponse, PermCategory, Permission, PermType } from "skynet-mysky-utils";
import { sign } from "tweetnacl";
import { genKeyPairFromSeed, hashWithSalt, sha512 } from "./crypto";
import { deriveEncryptedPathSeedForRoot, ENCRYPTION_ROOT_PATH_SEED_BYTES_LENGTH } from "./encrypted_files";
import { login, logout, register } from "./portal-account";
import { launchPermissionsProvider } from "./provider";
import { SEED_LENGTH } from "./seed";
import { fromHexString, log, readablePermission, validateObject, validateString } from "./util";

export const EMAIL_STORAGE_KEY = "email";
export const PORTAL_STORAGE_KEY = "portal";
export const SEED_STORAGE_KEY = "seed";

export const PORTAL_LOGIN_COMPLETE_SENTINEL_KEY = "portal-login-complete";

const INITIAL_PORTAL = "https://siasky.net";

// Descriptive salt that should not be changed.
const SALT_ENCRYPTED_PATH_SEED = "encrypted filesystem path seed";

// SALT_MESSAGE_SIGNING is the prefix with which we salt the data that MySky
// signs in order to be able to prove ownership of the MySky id.
const SALT_MESSAGE_SIGNING = "MYSKY_ID_VERIFICATION";

// Set `dev` based on whether we built production or dev.
let dev = false;
/// #if ENV == 'dev'
dev = true;
/// #endif

/**
 * Settings associated with a user's MySky account.
 *
 * @property portal - The user's preferred portal. We redirect a skapp to this portal, if it is set.
 * @property email - The user's portal account email. We connect to their portal account if this is set.
 */
type UserSettings = { portal: string | null; email: string | null };

/**
 * Convenience class containing the permissions provider handshake connection
 * and worker handle.
 */
export class PermissionsProvider {
  constructor(public connection: Connection, public worker: Worker) {}

  close() {
    this.worker.terminate();
    this.connection.close();
  }
}

// TODO: Rename to differentiate from `MySky` in SDK? Perhaps `MainMySky`.
/**
 * The MySky object containing the parent connection and permissions provider.
 *
 * @property client - The associated SkynetClient.
 * @property referrerDomain - The domain of the parent skapp.
 * @property parentConnection - The handshake connection with the parent window.
 * @property permissionsProvider - The permissions provider, if it has been loaded.
 */
export class MySky {
  protected parentConnection: Promise<Connection> | null = null;

  // ============
  // Constructors
  // ============

  constructor(
    protected client: SkynetClient,
    protected mySkyDomain: string,
    protected referrerDomain: string,
    protected permissionsProvider: Promise<PermissionsProvider> | null,
    protected preferredPortal: string | null
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
   * @returns - The MySky instance.
   */
  static async initialize(): Promise<MySky> {
    log("Initializing...");

    if (typeof Storage == "undefined") {
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

    // Check for the preferred portal in localstorage.
    let preferredPortal = checkStoredPreferredPortal();

    const initialClient = getLoginClient(seed, preferredPortal);

    // Get the referrer and MySky domains.
    const actualPortalClient = new SkynetClient();
    // Get the MySky domain (i.e. `skynet-mysky.hns or sandbridge.hns`).
    const mySkyDomain = await actualPortalClient.extractDomain(window.location.href);
    // Extract skapp domain from actual portal.
    // NOTE: The skapp should have opened MySky on the same portal as itself.
    const referrerDomain = await actualPortalClient.extractDomain(document.referrer);

    // Create MySky object.
    log("Calling new MySky()");
    const mySky = new MySky(initialClient, mySkyDomain, referrerDomain, permissionsProvider, preferredPortal);

    // Login to portal.
    {
      // Get email from local storage.
      let storedEmail = checkStoredEmail();

      // Get the preferred portal and stored email from user settings.
      if (seed && !preferredPortal) {
        const { portal, email } = await mySky.getUserSettings(seed);
        preferredPortal = portal;
        storedEmail = email;
      }

      // Set the portal.
      mySky.setPortal(preferredPortal);

      // Set up auto-relogin if the email was found.
      if (seed && storedEmail) {
        mySky.setupAutoRelogin(seed, storedEmail);
      }
    }

    // Set up the storage event listener.
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

  async getPreferredPortal(): Promise<string | null> {
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

    // Clear other stored values.
    clearStoredEmail();
    clearStoredPreferredPortal();

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
    const privateKeyBytes = fromHexString(privateKey);
    if (!privateKeyBytes) {
      throw new Error("Private key was not properly hex-encoded");
    }

    // Prepend a salt to the message, essentially name spacing it so the
    // signature is only useful for MySky ID verification.
    const hash = hashWithSalt(message, SALT_MESSAGE_SIGNING);

    // Return the signature.
    return sign.detached(hash, privateKeyBytes);
  }

  async signRegistryEntry(entry: RegistryEntry, path: string): Promise<Uint8Array> {
    // Check that the entry data key corresponds to the right path.

    const dataKey = deriveDiscoverableFileTweak(path);
    if (entry.dataKey !== dataKey) {
      throw new Error("Path does not match the data key in the registry entry.");
    }

    return this.signRegistryEntryHelper(entry, path, PermCategory.Discoverable);
  }

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
    const publicKeyBytes = fromHexString(publicKey);
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
      // NOTE: `getEncryptedFileSeed` was renamed to `getEncryptedPathSeed`, but
      // we still expose `getEncryptedFileSeed` in the API for backwards
      // compatibility.
      getEncryptedFileSeed: this.getEncryptedPathSeed.bind(this),
      getEncryptedPathSeed: this.getEncryptedPathSeed.bind(this),
      getPreferredPortal: this.getPreferredPortal.bind(this),
      logout: this.logout.bind(this),
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

  /**
   * Connects to a portal account by either registering or logging in to an
   * existing account. The resulting cookie will be set on the MySky domain.
   *
   * NOTE: We will register "auto re-login" in a separate function.
   *
   * @param seed - The user seed.
   * @param email - The user email.
   */
  protected async connectToPortalAccount(seed: Uint8Array, email: string): Promise<void> {
    log("Entered connectToPortalAccount");

    // Register and get the JWT cookie.
    //
    // Make requests to login and register in parallel. At most one can succeed,
    // and this saves a lot of time.
    try {
      await Promise.any([register(this.client, seed, email), login(this.client, seed, email)]);
    } catch (e) {
      throw new Error(`Could not register or login: ${e}`);
    }
  }

  /**
   * Gets the encrypted path seed for the given path without requiring
   * permissions. This should NOT be exported - for internal use only.
   *
   * @param seed - The user seed.
   * @param path - The given file or directory path.
   * @param isDirectory - Whether the path corresponds to a directory.
   * @returns - The hex-encoded encrypted path seed.
   */
  async getEncryptedPathSeedInternal(seed: Uint8Array, path: string, isDirectory: boolean): Promise<string> {
    log("Entered getEncryptedPathSeedInternal");

    // Compute the root path seed.
    const rootPathSeedBytes = deriveRootPathSeed(seed);

    // Compute the child path seed.
    return deriveEncryptedPathSeedForRoot(rootPathSeedBytes, path, isDirectory);
  }

  /**
   * Checks for the preferred portal and stored email in user settings, and sets
   * them if found.
   *
   * @param seed - The user seed.
   * @returns - The portal and email, if found.
   */
  protected async getUserSettings(seed: Uint8Array): Promise<UserSettings> {
    log("Entered getUserSettings");

    let email = null,
      portal = null;

    // Get the settings path for the MySky domain.
    const path = await this.getUserSettingsPath();

    // Check for stored portal and email in user settings.
    const { data: userSettings } = await this.getJSONEncryptedInternal(seed, path);
    if (userSettings) {
      email = (userSettings.email as string) || null;
      portal = (userSettings.portal as string) || null;
    }

    return { portal, email };
  }

  /**
   * Sets the user settings.
   *
   * @param seed - The user seed.
   * @param settings - The given user settings.
   */
  protected async setUserSettings(seed: Uint8Array, settings: UserSettings): Promise<void> {
    // Get the settings path for the MySky domain.
    const path = await this.getUserSettingsPath();

    // Set preferred portal and email in user settings.
    await this.setJSONEncryptedInternal(seed, path, settings);
  }

  /**
   * Gets Encrypted JSON at the given path through MySky.
   *
   * @param seed - The user seed.
   * @param path - The data path.
   * @returns - An object containing the decrypted json data.
   * @throws - Will throw if the user does not have Hidden Read permission on the path.
   */
  protected async getJSONEncryptedInternal(seed: Uint8Array, path: string): Promise<EncryptedJSONResponse> {
    log("Entered getJSONEncryptedInternal");

    validateString("path", path, "parameter");

    // Call MySky which checks for read permissions on the path.
    const [publicKey, pathSeed] = await Promise.all([
      this.userID(),
      this.getEncryptedPathSeedInternal(seed, path, false),
    ]);

    // Fetch the raw encrypted JSON data.
    const dataKey = deriveEncryptedFileTweak(pathSeed);
    log("Calling getRawBytes");
    const { data } = await this.client.db.getRawBytes(publicKey, dataKey);
    if (data === null) {
      return { data: null };
    }

    const encryptionKey = deriveEncryptedFileKeyEntropy(pathSeed);
    const json = decryptJSONFile(data, encryptionKey);

    return { data: json };
  }

  /**
   * Sets Encrypted JSON at the given path through MySky.
   *
   * @param seed - The user seed.
   * @param path - The data path.
   * @param json - The json to encrypt and set.
   * @returns - An object containing the original json data.
   * @throws - Will throw if the user does not have Hidden Write permission on the path.
   */
  protected async setJSONEncryptedInternal(
    seed: Uint8Array,
    path: string,
    json: JsonData
  ): Promise<EncryptedJSONResponse> {
    log("Entered setJSONEncryptedInternal");

    validateString("path", path, "parameter");
    validateObject("json", json, "parameter");

    const opts = { hashedDataKeyHex: true };

    // Call MySky which checks for read permissions on the path.
    const [publicKey, pathSeed] = await Promise.all([
      this.userID(),
      this.getEncryptedPathSeedInternal(seed, path, false),
    ]);
    const dataKey = deriveEncryptedFileTweak(pathSeed);

    // Immediately fail if the mutex is not available.
    return await this.client.db.revisionNumberCache.withCachedEntryLock(
      publicKey,
      dataKey,
      async (cachedRevisionEntry) => {
        // Get the cached revision number before doing anything else.
        const newRevision = incrementRevision(cachedRevisionEntry.revision);

        // Derive the key.
        const encryptionKey = deriveEncryptedFileKeyEntropy(pathSeed);

        // Pad and encrypt json file.
        const data = encryptJSONFile(json, { version: ENCRYPTED_JSON_RESPONSE_VERSION }, encryptionKey);

        const [entry] = await getOrCreateSkyDBRegistryEntry(this.client, dataKey, data, newRevision, opts);

        // Call MySky which checks for write permissions on the path.
        const signature = await this.signEncryptedRegistryEntryInternal(seed, entry, path);

        await this.client.registry.postSignedEntry(publicKey, entry, signature);

        return { data: json };
      }
    );
  }

  /**
   * Get the path to the user settings stored in the root MySky domain.
   *
   * @returns - The user settings path.
   */
  protected async getUserSettingsPath(): Promise<string> {
    return `${this.mySkyDomain}/settings.json`;
  }

  /**
   * Logs in from MySky UI.
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
   * 3. If we got the email, then we register/login to set the JWT cookie
   * (`connectToPortalAccount`).
   *
   * 4. If the email is set, it should set up automatic re-login on JWT
   * cookie expiry.
   *
   * 5. Save the email in user settings.
   *
   * 6. Trigger a load of the permissions provider.
   *
   * @param seed - The user seed.
   */
  protected async loginFromUi(seed: Uint8Array): Promise<void> {
    log("Entered loginFromUi");

    // Connect to siasky.net first.
    //
    // NOTE: Don't use the stored preferred portal here because we are just
    // logging into a new account and need to get the user settings for the
    // first time. Always use siasky.net.
    this.client = getLoginClient(seed, null);

    // Login to portal.
    {
      // Get the preferred portal and switch to it.
      const { portal: preferredPortal, email } = await this.getUserSettings(seed);
      let storedEmail = email;

      // Set the portal
      this.setPortal(preferredPortal);

      // The email wasn't in the user settings but the user might have just
      // signed up with it -- check local storage. We don't need to do this if
      // the email was already found.
      // TODO: Add dedicated flow(s) for changing the email after it's set.
      let isEmailProvidedByUser = false;
      if (!storedEmail) {
        storedEmail = checkStoredEmail();
        isEmailProvidedByUser = storedEmail !== null;
      }

      if (storedEmail) {
        // Register/login to ensure the email is valid and get the JWT (in case
        // we don't redirect to a preferred portal).
        await this.connectToPortalAccount(seed, storedEmail);

        // Set up auto re-login on JWT expiry.
        this.setupAutoRelogin(seed, storedEmail);

        // Save the email in user settings. Do this after we've connected to
        // the portal account so we know that the email is valid.
        if (isEmailProvidedByUser) {
          await this.setUserSettings(seed, { portal: preferredPortal, email: storedEmail });
        }
      }
    }

    // Launch the new permissions provider.
    this.permissionsProvider = launchPermissionsProvider(seed);
  }

  /**
   * Sets the portal, either the preferred portal if given or the current portal
   * otherwise.
   *
   * @param preferredPortal - The user's preferred portal
   */
  protected setPortal(preferredPortal: string | null): void {
    log("Entered setPortal");

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
   * Sets up auto re-login. It modifies the client's `executeRequest` method to
   * check if the request failed with `401 Unauthorized Response`. If so, it
   * will try to login and make the request again.
   *
   * NOTE: If the request was a portal account logout, we will not login again
   * just to logout. We also will not throw an error on 401, instead returning
   * silently. There is no way for the client to know whether the cookie is set
   * ahead of time, and an error would not be actionable.
   *
   * NOTE: We restore the original `executeRequest` on logout. We do not try to
   * modify `executeRequest` if it is already modified and throw an error
   * instead.
   *
   * @param seed - The user seed.
   * @param email - The user email.
   */
  protected setupAutoRelogin(seed: Uint8Array, email: string): void {
    log("Entered setupAutoRelogin");

    if (this.client.customOptions.loginFn) {
      throw new Error("Tried to setup auto re-login with it already being set up");
    }

    this.client.customOptions.loginFn = async () => {
      await login(this.client, seed, email);
    };
  }

  /**
   * Set up a listener for the storage event. Triggered when the seed is set.
   * Unloads the permission provider to disable MySky functionality until the
   * permission provider is loaded again at the end.
   *
   * For the preferred portal flow, see "Load MySky redirect flow" on
   * `redirectIfNotOnPreferredPortal` in the SDK.
   */
  protected setupStorageEventListener(): void {
    log("Entered setupStorageEventListener");

    window.addEventListener("storage", async ({ key, newValue }: StorageEvent) => {
      if (key !== SEED_STORAGE_KEY) {
        return;
      }

      log("Entered storage event listener with seed storage key");

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

      try {
        // Parse the seed.
        const seed = new Uint8Array(JSON.parse(newValue));

        await this.loginFromUi(seed);

        // Signal to MySky UI that we are done.
        localStorage.setItem(PORTAL_LOGIN_COMPLETE_SENTINEL_KEY, "1");
      } catch (e) {
        log(`Error in storage event listener: ${e}`);

        // Send error to MySky UI.
        localStorage.setItem(PORTAL_LOGIN_COMPLETE_SENTINEL_KEY, (e as Error).message);
      }
    });
  }

  /**
   * Signs the encrypted registry entry without requiring permissions. For
   * internal use only.
   *
   * @param seed - The user seed.
   * @param entry - The encrypted registry entry.
   * @param path - The MySky path.
   * @returns - The signature.
   */
  async signEncryptedRegistryEntryInternal(seed: Uint8Array, entry: RegistryEntry, path: string): Promise<Uint8Array> {
    // Check that the entry data key corresponds to the right path.

    // Use `isDirectory: false` because registry entries can only correspond to files right now.
    const pathSeed = await this.getEncryptedPathSeedInternal(seed, path, false);
    const dataKey = deriveEncryptedFileTweak(pathSeed);
    if (entry.dataKey !== dataKey) {
      throw new Error("Path does not match the data key in the encrypted registry entry.");
    }

    return this.signRegistryEntryHelper(entry, path, PermCategory.Hidden);
  }

  protected async signRegistryEntryHelper(
    entry: RegistryEntry,
    path: string,
    category: PermCategory
  ): Promise<Uint8Array> {
    log("Entered signRegistryEntry");

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
 * Checks for email stored in local storage.
 *
 * @returns - The email, or null if not found.
 */
export function checkStoredEmail(): string | null {
  log("Entered checkStoredEmail");

  const email = localStorage.getItem(EMAIL_STORAGE_KEY);
  return email || null;
}

/**
 * Checks for preferred portal stored in local storage.
 *
 * @returns - The preferred portal, or null if not found.
 */
export function checkStoredPreferredPortal(): string | null {
  log("Entered checkStoredPreferredPortal");

  const portal = localStorage.getItem(PORTAL_STORAGE_KEY);
  return portal || null;
}

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
    log(err as string);
    clearStoredSeed();
    return null;
  }

  return seed;
}

/**
 * Clears the stored email from local storage.
 */
function clearStoredEmail(): void {
  log("Entered clearStoredEmail");

  localStorage.removeItem(EMAIL_STORAGE_KEY);
}

/**
 * Clears the stored preferred portal from local storage.
 */
function clearStoredPreferredPortal(): void {
  log("Entered clearStoredPreferredPortal");

  localStorage.removeItem(PORTAL_STORAGE_KEY);
}

/**
 * Clears the stored seed from local storage.
 */
export function clearStoredSeed(): void {
  log("Entered clearStoredSeed");

  localStorage.removeItem(SEED_STORAGE_KEY);
}

/**
 * Derives the root path seed.
 *
 * @param seed - The user seed.
 * @returns - The root path seed.
 */
function deriveRootPathSeed(seed: Uint8Array): Uint8Array {
  const bytes = new Uint8Array([...sha512(SALT_ENCRYPTED_PATH_SEED), ...sha512(seed)]);
  // NOTE: Truncate to 32 bytes instead of the 64 bytes for a directory path
  // seed. This is a historical artifact left for backwards compatibility.
  return sha512(bytes).slice(0, ENCRYPTION_ROOT_PATH_SEED_BYTES_LENGTH);
}

/**
 * Initialize the Skynet client.
 *
 * Connect to the preferred portal if it was found, otherwise connect to
 * siasky.net if the seed was found, otherwise connect to the current
 * portal.
 *
 * @param seed - The user seed, if given.
 * @param preferredPortal - The user's preferred portal, if found.
 * @returns - The Skynet client to be used for logging in to the portal.
 */
function getLoginClient(seed: Uint8Array | null, preferredPortal: string | null): SkynetClient {
  log("Entered getLoginClient");

  const initialPortal = seed ? INITIAL_PORTAL : undefined;
  return new SkynetClient(preferredPortal || initialPortal);
}

/**
 * Increments the given revision number and checks to make sure it is not
 * greater than the maximum revision.
 *
 * @param revision - The given revision number.
 * @returns - The incremented revision number.
 * @throws - Will throw if the incremented revision number is greater than the maximum revision.
 */
function incrementRevision(revision: bigint): bigint {
  revision = revision + BigInt(1);

  // Throw if the revision is already the maximum value.
  if (revision > MAX_REVISION) {
    throw new Error("Current entry already has maximum allowed revision, could not update the entry");
  }

  return revision;
}
