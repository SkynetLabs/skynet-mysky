import { ChildHandshake, WindowMessenger } from "post-me";
import type { Connection } from "post-me";
import { CheckPermissionsResponse, PermCategory, Permission, PermType } from "skynet-mysky-utils";
import {
  deriveDiscoverableFileTweak,
  deriveEncryptedFileTweak,
  RegistryEntry,
  signEntry,
  SkynetClient,
} from "skynet-js";

import { launchPermissionsProvider } from "./provider";
import { hash, sign } from "tweetnacl";

import { genKeyPairFromSeed, sha512 } from "./crypto";
import { fromHexString, log, readablePermission, uint8ArrayEquals } from "./util";
import { SEED_LENGTH } from "./seed";
import { deriveEncryptedPathSeedForRoot, ENCRYPTION_ROOT_PATH_SEED_BYTES_LENGTH } from "./encrypted_files";

const SEED_STORAGE_KEY = "seed";

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

let permissionsProvider: Promise<Connection> | null = null;

// Set up a listener for the storage event. If the seed is set in the UI, it
// should trigger a load of the permissions provider.
window.addEventListener("storage", ({ key, newValue }: StorageEvent) => {
  if (key !== SEED_STORAGE_KEY) {
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
  protected parentConnection: Promise<Connection>;

  // ============
  // Constructors
  // ============

  constructor(protected client: SkynetClient, protected referrerDomain: string) {
    // Set child methods.

    const methods = {
      checkLogin: this.checkLogin.bind(this),
      getEncryptedFileSeed: this.getEncryptedPathSeed.bind(this),
      getEncryptedPathSeed: this.getEncryptedPathSeed.bind(this),
      logout: this.logout.bind(this),
      signMessage: this.signMessage.bind(this),
      signRegistryEntry: this.signRegistryEntry.bind(this),
      signEncryptedRegistryEntry: this.signEncryptedRegistryEntry.bind(this),
      userID: this.userID.bind(this),
      verifyMessageSignature: this.verifyMessageSignature.bind(this),
    };

    // Enable communication with connector in parent skapp.

    log("Making handshake");
    const messenger = new WindowMessenger({
      localWindow: window,
      remoteWindow: window.parent,
      remoteOrigin: "*",
    });
    this.parentConnection = ChildHandshake(messenger, methods);
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

    // Initialize the Skynet client.

    const client = new SkynetClient();

    // Get the referrer.

    const referrerDomain = await client.extractDomain(document.referrer);

    // Create MySky object.

    log("Calling new MySky()");
    const mySky = new MySky(client, referrerDomain);

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

    const bytes = new Uint8Array([...sha512(SALT_ENCRYPTED_PATH_SEED), ...sha512(seed)]);
    // NOTE: Truncate to 32 bytes instead of the 64 bytes for a directory path
    // seed. This is a historical artifact left for backwards compatibility.
    const rootPathSeedBytes = sha512(bytes).slice(0, ENCRYPTION_ROOT_PATH_SEED_BYTES_LENGTH);

    // Compute the child path seed.

    return deriveEncryptedPathSeedForRoot(rootPathSeedBytes, path, isDirectory);
  }

  // TODO
  /**
   * Logs out of MySky.
   */
  async logout(): Promise<void> {
    // Clear the stored seed.

    clearStoredSeed();
  }

  /**
   * signMessage will sign the given data using the MySky user's private key,
   * this method can be used for MySky user verification as the signature may be
   * verified against the user's public key, which is the MySky user id.
   *
   * NOTE: verifyMessageSignature is the counter part of this method, and
   * verifies an original message against the signature and the user's public
   * key
   *
   * NOTE: this function (internally) adds a salt to the given data array to
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

    // fetch the private key
    const { privateKey } = genKeyPairFromSeed(seed);
    const privateKeyBytes = fromHexString(privateKey);
    if (!privateKeyBytes) {
      throw new Error("Corrupted key pair");
    }

    // prepend a salt to the message, essentially name spacing it so the
    // signature is only useful for MySky ID verification
    const hashed = sha512(new Uint8Array([...sha512(SALT_MESSAGE_SIGNING), ...sha512(message)]));

    // return the signature
    return sign.detached(hashed, privateKeyBytes);
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
    // transform the public key to a by array
    const publicKeyBytes = fromHexString(publicKey);
    if (!publicKeyBytes) {
      throw new Error("Given public key is not valid hex");
    }

    // reconstruct the original message
    const originalMessage = sha512(new Uint8Array([...sha512(SALT_MESSAGE_SIGNING), ...sha512(message)]));

    // verify the message against the signature and public key
    return sign.detached.verify(originalMessage, signature, publicKeyBytes);
  }

  // ================
  // Internal Methods
  // ================

  async signRegistryEntryHelper(entry: RegistryEntry, path: string, category: PermCategory): Promise<Uint8Array> {
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

  async checkPermission(path: string, category: PermCategory, permType: PermType): Promise<void> {
    // Check for the permissions provider.

    if (!permissionsProvider) {
      throw new Error("Permissions provider not loaded");
    }

    const perm = new Permission(this.referrerDomain, path, category, permType);
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
 *
 */
export function clearStoredSeed(): void {
  log("Entered clearStoredSeed");

  if (!localStorage) {
    console.log("WARNING: localStorage disabled");
    return;
  }

  localStorage.removeItem(SEED_STORAGE_KEY);
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
  if (dev) {
    seed = saltSeedDevMode(seed);
  }

  localStorage.setItem(SEED_STORAGE_KEY, JSON.stringify(Array.from(seed)));
}

/**
 * Salts the given seed for developer mode.
 *
 * @param seed - The seed to salt.
 * @returns - The new seed after being salted.
 */
function saltSeedDevMode(seed: Uint8Array): Uint8Array {
  return sha512(new Uint8Array([...sha512("developer mode"), ...hash(seed)])).slice(0, 16);
}
