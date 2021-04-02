import { ChildHandshake, ParentHandshake, WindowMessenger, WorkerMessenger } from "post-me";
import type { Connection } from "post-me";
import { PermCategory, Permission, PermType } from "skynet-interface-utils";
import { genKeyPairFromSeed, RegistryEntry, SkynetClient } from "skynet-js";

const seedStorageKey = "seed";

export class MySky {
  protected permissionsProvider?: Connection;

  // ============
  // Constructors
  // ============

  constructor(protected client: SkynetClient, protected parentConnection: Connection) {
    // Set child methods.

    const methods = {
      checkLogin: this.checkLogin.bind(this),
      logout: this.logout.bind(this),
    };
    this.parentConnection.localHandle().setMethods(methods);
  }

  static async initialize(): Promise<MySky> {
    if (typeof Storage == "undefined") {
      throw new Error("Browser does not support web storage");
    }

    // Enable communication with connector in parent skapp.

    const messenger = new WindowMessenger({
      localWindow: window,
      remoteWindow: window.parent,
      remoteOrigin: "*",
    });
    // NOTE: We set the methods in the constructor since we don't have 'this' here.
    const parentConnection = await ChildHandshake(messenger);

    // Initialize the Skynet client.

    const client = new SkynetClient();

    // Create MySky object.

    const mySky = new MySky(client, parentConnection);

    // Check for stored seed in localstorage.

    const seed = MySky.checkStoredSeed();

    // If seed was found, load the user's permission provider.
    if (seed) {
      await mySky.loadPermissionsProvider(seed);
    }

    return mySky;
  }

  // ==========
  // Public API
  // ==========

  async checkLogin(perms: Permission[]): Promise<boolean> {
    // Check for stored seed in localstorage.
    const seed = MySky.checkStoredSeed();
    if (!seed) {
      return false;
    }

    // Permissions provider should have been loaded by now.
    // TODO: Should this be async?
    if (!this.permissionsProvider) {
      return false;
    }

    // Check given permissions with the permissions provider.
    // TODO: Pass requesting skapp + dac domains?
    return this.permissionsProvider.remoteHandle().call("checkPermissions", perms);
  }

  /**
   * Logs out of MySky.
   */
  async logout(): Promise<void> {
    // TODO
  }

  async signRegistryEntry(entry: RegistryEntry, path: string): Promise<Uint8Array> {
    if (!this.permissionsProvider) {
      throw new Error("Permissions provider not loaded");
    }

    // Check with the permissions provider that we have permission for this request.

    const requestor = document.referrer;
    // TODO: Support for signing hidden files.
    const permission = new Permission(requestor, path, PermCategory.Discoverable, PermType.Write);
    const granted = this.permissionsProvider.remoteHandle().call("checkPermissions", [permission]);
    if (!granted) {
      throw new Error("Permission was not granted");
    }

    // Get the seed.

    const seed = MySky.checkStoredSeed();
    if (!seed) {
      throw new Error("User seed not found");
    }

    // Get the private key.

    const { privateKey } = genKeyPairFromSeed(seed);

    // Sign the entry.

    return await this.client.registry.signEntry(privateKey, entry);
  }

  async userID(): Promise<string> {
    // Get the seed.

    const seed = MySky.checkStoredSeed();
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

  // TODO
  protected async loadPermissionsProvider(seed: string): Promise<void> {
    // Derive the user.
    const { publicKey } = genKeyPairFromSeed(seed);

    // Check the user's saved preferences.

    // If no saved preference, use the default permissions provider.

    // Load the worker.

    const worker = new Worker(workerJsUrl);
    const messenger = new WorkerMessenger({ worker });
    // TODO: Pass custom handshake options.
    this.permissionsProvider = await ParentHandshake(messenger);
  }

  // ==============
  // Helper Methods
  // ==============

  /**
   * Checks for seed stored in local storage from previous sessions.
   *
   * @returns - The seed, or null if not found.
   */
  static checkStoredSeed(): string | null {
    if (!localStorage) {
      console.log("WARNING: localStorage disabled");
      return null;
    }

    return localStorage.getItem(seedStorageKey);
  }
}
