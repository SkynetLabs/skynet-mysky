import { ChildHandshake, WindowMessenger } from "post-me";
import type { Connection } from "post-me";
import { CheckPermissionsResponse, CustomUserIDOptions, PermCategory, Permission, PermType } from "skynet-mysky-utils";
import { deriveEncryptedFileSeed, RegistryEntry, signEntry, SkynetClient } from "skynet-js";

import { launchPermissionsProvider } from "./provider";
import { hash } from "tweetnacl";

import { genKeyPairFromSeed, log, readablePermission, sha512, stringToUint8ArrayUtf8, toHexString } from "./util";
import { SEED_LENGTH } from "./seed";
import { ENCRYPTION_PATH_SEED_LENGTH } from "../../skynet-js/dist/cjs";

export const mySkyDomain = "skynet-mysky.hns/";

const referrer = document.referrer;
const seedStorageKey = "seed";

let permissionsProvider: Promise<Connection> | null = null;

let dev = false;
/// #if ENV == 'dev'
dev = true;
/// #endif

// Set up a listener for the storage event. If the seed is set in the UI, it should trigger a load of the permissions provider.
window.addEventListener("storage", ({ key, newValue }: StorageEvent) => {
  if (!key || key !== seedStorageKey) {
    return;
  }
  if (!newValue) {
    // Seed was removed.
    // TODO: Unload the permissions provider.
    return;
  }

  const seed = new Uint8Array(JSON.parse(newValue));

  if (!permissionsProvider) {
    permissionsProvider = launchPermissionsProvider(seed);
  }
});

export class MySky {
  // ============
  // Constructors
  // ============

  constructor(protected client: SkynetClient, protected parentConnection: Connection) {
    // Set child methods.

    const methods = {
      checkLogin: this.checkLogin.bind(this),
      getEncryptedFileSeed: this.getEncryptedFileSeed.bind(this),
      logout: this.logout.bind(this),
      signRegistryEntry: this.signRegistryEntry.bind(this),
      signEncryptedRegistryEntry: this.signEncryptedRegistryEntry.bind(this),
      userID: this.userID.bind(this),
    };
    this.parentConnection.localHandle().setMethods(methods);
  }

  static async initialize(): Promise<MySky> {
    log("Initializing...");

    if (typeof Storage == "undefined") {
      throw new Error("Browser does not support web storage");
    }

    // Check for stored seed in localstorage.

    const seed = checkStoredSeed();

    // If seed was found, load the user's permission provider.

    if (seed) {
      log("Seed found.");
      permissionsProvider = launchPermissionsProvider(seed);
    }

    // Enable communication with connector in parent skapp.

    log("Making handshake");
    const messenger = new WindowMessenger({
      localWindow: window,
      remoteWindow: window.parent,
      remoteOrigin: "*",
    });
    const parentConnection = await ChildHandshake(messenger);

    // Initialize the Skynet client.

    const client = new SkynetClient();

    // Create MySky object.

    log("Calling new MySky()");
    const mySky = new MySky(client, parentConnection);

    return mySky;
  }

  // ==========
  // Public API
  // ==========

  async checkLogin(perms: Permission[]): Promise<[boolean, CheckPermissionsResponse]> {
    log("Entered checkLogin");

    // Check for stored seed in localstorage.
    const seed = checkStoredSeed();
    if (!seed) {
      log("Seed not found");
      const permissionsResponse = { grantedPermissions: [], failedPermissions: perms };
      return [false, permissionsResponse];
    }

    // Permissions provider should have been loaded by now.
    // TODO: Should this be async?
    if (!permissionsProvider) {
      throw new Error("Permissions provider not loaded");
    }

    // Check given permissions with the permissions provider.
    log("Calling checkPermissions");
    const connection = await permissionsProvider;
    const permissionsResponse: CheckPermissionsResponse = await connection
      .remoteHandle()
      .call("checkPermissions", perms, dev);

    return [true, permissionsResponse];
  }

  async getEncryptedFileSeed(path: string, isDirectory: boolean) {
    log("Entered getEncryptedFileSeed");

    // Check with the permissions provider that we have permission for this request.

    this.checkPermission(path, PermCategory.Hidden, PermType.Read);

    // Get the seed.

    const seed = checkStoredSeed();
    if (!seed) {
      throw new Error("User seed not found");
    }

    // Compute the root path seed.

    const bytes = new Uint8Array([...sha512("encrypted filesystem path seed"), ...sha512(seed)]);
    const rootPathSeed = toHexString(sha512(bytes).slice(0, ENCRYPTION_PATH_SEED_LENGTH));

    // Compute the child path seed.

    return deriveEncryptedFileSeed(rootPathSeed, path, isDirectory);
  }

  // TODO
  /**
   * Logs out of MySky.
   */
  async logout(): Promise<void> {
    // Clear the stored seed.

    clearStoredSeed();
  }

  async signRegistryEntry(entry: RegistryEntry, path: string): Promise<Uint8Array> {
    return this.signRegistryEntryHelper(entry, path, PermCategory.Discoverable);
  }

  async signEncryptedRegistryEntry(entry: RegistryEntry, path: string): Promise<Uint8Array> {
    return this.signRegistryEntryHelper(entry, path, PermCategory.Hidden);
  }

  async userID(_opts?: CustomUserIDOptions): Promise<string> {
    // Get the seed.

    const seed = checkStoredSeed();
    if (!seed) {
      throw new Error("User seed not found");
    }

    // Get the public key.

    const { publicKey } = genKeyPairFromSeed(seed);
    return publicKey;
  }

  // ================
  // Internal Methods
  // ================

  async signRegistryEntryHelper(entry: RegistryEntry, path: string, category: PermCategory): Promise<Uint8Array> {
    log("Entered signRegistryEntry");

    // Check with the permissions provider that we have permission for this request.

    this.checkPermission(path, category, PermType.Write);

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

  async checkPermission(path: string, category: PermCategory, permType: PermType): Promise<void> {
    // Check for the permissions provider.

    if (!permissionsProvider) {
      throw new Error("Permissions provider not loaded");
    }

    const referrerDomain = await this.client.extractDomain(referrer);
    const perm = new Permission(referrerDomain, path, category, permType);
    log(`Checking permission: ${JSON.stringify(perm)}`);
    const connection = await permissionsProvider;
    const resp: CheckPermissionsResponse = await connection.remoteHandle().call("checkPermissions", [perm], dev);
    if (resp.failedPermissions.length > 0) {
      const readablePerm = readablePermission(perm);
      throw new Error(`Permission was not granted: ${readablePerm}`);
    }
  }
}

/**
 * Checks for seed stored in local storage from previous sessions.
 *
 * @returns - The seed, or null if not found.
 */
export function checkStoredSeed(): Uint8Array | null {
  log("Entered checkStoredSeed");

  if (!localStorage) {
    console.log("WARNING: localStorage disabled");
    return null;
  }

  const seedStr = localStorage.getItem(seedStorageKey);
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
    log(err);
    clearStoredSeed();
    return null;
  }

  return seed;
}

/**
 *
 */
export function clearStoredSeed(): void {
  log("Entered clearStoredSeed");

  if (!localStorage) {
    console.log("WARNING: localStorage disabled");
    return;
  }

  localStorage.removeItem(seedStorageKey);
}

/**
 * Stores the root seed in local storage. The seed should only ever be used by retrieving it from storage.
 * NOTE: If ENV == 'dev' the seed is salted before storage.
 *
 * @param seed - The root seed.
 */
export function saveSeed(seed: Uint8Array): void {
  if (!localStorage) {
    console.log("WARNING: localStorage disabled, seed not stored");
    return;
  }

  // If in dev mode, salt the seed.
  /// #if ENV == 'dev'
  seed = saltSeed(seed);
  /// #endif

  localStorage.setItem(seedStorageKey, JSON.stringify(Array.from(seed)));
}

/**
 * @param seed
 */
function saltSeed(seed: Uint8Array): Uint8Array {
  return sha512(new Uint8Array([...sha512("developer mode"), ...hash(seed)])).slice(0, 16);
}
