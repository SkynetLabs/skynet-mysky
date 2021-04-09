import { ChildHandshake, WindowMessenger } from "post-me";
import type { Connection } from "post-me";
import { CheckPermissionsResponse, PermCategory, Permission, PermType } from "skynet-mysky-utils";
import { genKeyPairFromSeed, RegistryEntry, signEntry, SkynetClient } from "skynet-js";
import { launchPermissionsProvider } from "./provider";
import { log } from "./util";

export const mySkyDomain = "skynet-mysky.hns/";

const referrer = document.referrer;
const seedStorageKey = "seed";

let permissionsProvider: Promise<Connection> | null = null;

// Set up a listener for the storage event. If the seed is set in the UI, it should trigger a load of the permissions provider.
window.addEventListener("storage", ({ key, newValue }: StorageEvent) => {
  if (!key || key !== seedStorageKey) {
    return;
  }
  if (!newValue) {
    // Seed was removed.
    // TODO: Unload the permissions provider.
  }

  if (!permissionsProvider) {
    permissionsProvider = launchPermissionsProvider(key);
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

    log("Calling checkStoredSeed");
    const seed = checkStoredSeed();

    // If seed was found, load the user's permission provider.
    if (seed) {
      log("Seed found, calling launchPermissionsProvider");
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

    log("Calling new MySky");
    const mySky = new MySky(client, parentConnection);

    return mySky;
  }

  // ==========
  // Public API
  // ==========

  async checkLogin(perms: Permission[]): Promise<[boolean, CheckPermissionsResponse]> {
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
      .call("checkPermissions", perms);

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
    const perm = new Permission(referrer, path, PermCategory.Discoverable, PermType.Write);
    const connection = await permissionsProvider;
    const failedPermissions: Permission[] = await connection.remoteHandle().call("checkPermissions", [perm]);
    if (failedPermissions.length > 0) {
      throw new Error("Permission was not granted");
    }

    // Get the private key.

    const { privateKey } = genKeyPairFromSeed(seed);

    // Sign the entry.

    const signature = await signEntry(privateKey, entry);
    return signature;
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
export function checkStoredSeed(): string | null {
  if (!localStorage) {
    console.log("WARNING: localStorage disabled");
    return null;
  }

  return localStorage.getItem(seedStorageKey);
}

export function clearStoredSeed(): void {
  if (!localStorage) {
    console.log("WARNING: localStorage disabled");
    return;
  }

  localStorage.removeItem(seedStorageKey);
}

/**
 * Stores the root seed in local storage.
 *
 * @param seed - The root seed.
 */
export function saveSeed(seed: string): void {
  if (!localStorage) {
    console.log("WARNING: localStorage disabled, seed not stored");
    return;
  }

  localStorage.setItem(seedStorageKey, seed);
}
