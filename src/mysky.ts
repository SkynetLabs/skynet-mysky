import { ChildHandshake, WindowMessenger } from "post-me";
import type { Connection } from "post-me";
import { CheckPermissionsResponse, CustomUserIDOptions, PermCategory, Permission, PermType } from "skynet-mysky-utils";
import { RegistryEntry, signEntry, SkynetClient } from "skynet-js";

import { launchPermissionsProvider } from "./provider";
import { genKeyPairFromSeed, log, stringToUint8ArrayUtf8 } from "./util";
import { hash } from "tweetnacl";

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
      logout: this.logout.bind(this),
      signRegistryEntry: this.signRegistryEntry.bind(this),
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
      const permissionsResponse = { grantedPermissions: [], failedPermissions: perms };
      return [false, permissionsResponse];
    }

    // Permissions provider should have been loaded by now.
    // TODO: Should this be async?
    if (!permissionsProvider) {
      throw new Error("Permissions provider not loaded");
    }

    // Check given permissions with the permissions provider.
    const connection = await permissionsProvider;
    const permissionsResponse: CheckPermissionsResponse = await connection
      .remoteHandle()
      .call("checkPermissions", perms, dev);

    return [true, permissionsResponse];
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
    log("Entered signRegistryEntry");

    // Get the seed.

    const seed = checkStoredSeed();
    if (!seed) {
      throw new Error("User seed not found");
    }

    // Check for the permissions provider.

    if (!permissionsProvider) {
      throw new Error("Permissions provider not loaded");
    }

    // Check with the permissions provider that we have permission for this request.

    // TODO: Support for signing hidden files.
    const referrerDomain = await this.client.extractDomain(referrer);
    const perm = new Permission(referrerDomain, path, PermCategory.Discoverable, PermType.Write);
    log(`Requesting permission: ${JSON.stringify(perm)}`);
    const connection = await permissionsProvider;
    const resp: CheckPermissionsResponse = await connection.remoteHandle().call("checkPermissions", [perm], dev);
    if (resp.failedPermissions.length > 0) {
      throw new Error("Permission was not granted");
    }

    // Get the private key.

    const { privateKey } = genKeyPairFromSeed(seed);

    // Sign the entry.

    const signature = await signEntry(privateKey, entry, true);
    return signature;
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

  // ==============
  // Helper Methods
  // ==============
}

/**
 * Checks for seed stored in local storage from previous sessions.
 *
 * @returns - The seed, or null if not found.
 */
export function checkStoredSeed(): Uint8Array | null {
  if (!localStorage) {
    console.log("WARNING: localStorage disabled");
    return null;
  }

  const seedStr = localStorage.getItem(seedStorageKey);
  if (!seedStr) {
    return null;
  }
  const seed = new Uint8Array(JSON.parse(seedStr));

  return seed;
}

/**
 *
 */
export function clearStoredSeed(): void {
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
  return hash(hash(stringToUint8ArrayUtf8("developer mode")) || hash(seed)).slice(0, 16);
}
