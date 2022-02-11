import {
  deriveEncryptedFileKeyEntropy,
  deriveEncryptedFileTweak,
  decryptJSONFile,
  ENCRYPTED_JSON_RESPONSE_VERSION,
  EncryptedJSONResponse,
  getOrCreateSkyDBRegistryEntry,
  JsonData,
  SkynetClient,
  encryptJSONFile,
  MAX_REVISION,
  RegistryEntry,
  signEntry,
} from "skynet-js";

import { deriveRootPathSeed, genKeyPairFromSeed } from "./crypto";
import { deriveEncryptedPathSeedForRoot } from "./encrypted_files";
import { log, validateObject, validateString } from "./util";

/**
 * Gets Encrypted JSON at the given path through MySky.
 *
 * @param client - The Skynet client.
 * @param seed - The root MySky user seed.
 * @param path - The data path.
 * @returns - An object containing the decrypted json data.
 * @throws - Will throw if the user does not have Hidden Read permission on the path.
 */
export async function getJSONEncryptedInternal(
  client: SkynetClient,
  seed: Uint8Array,
  path: string
): Promise<EncryptedJSONResponse> {
  log("Entered getJSONEncryptedInternal");

  validateString("path", path, "parameter");

  const { publicKey } = genKeyPairFromSeed(seed);
  const pathSeed = await getEncryptedPathSeedInternal(seed, path, false);

  // Fetch the raw encrypted JSON data.
  const dataKey = deriveEncryptedFileTweak(pathSeed);
  const opts = { hashedDataKeyHex: true };
  log("Calling getRawBytes");
  const { data } = await client.db.getRawBytes(publicKey, dataKey, opts);
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
 * @param client - The Skynet client.
 * @param seed - The root MySky user seed.
 * @param path - The data path.
 * @param json - The json to encrypt and set.
 * @returns - An object containing the original json data.
 * @throws - Will throw if the user does not have Hidden Write permission on the path.
 */
export async function setJSONEncryptedInternal(
  client: SkynetClient,
  seed: Uint8Array,
  path: string,
  json: JsonData
): Promise<EncryptedJSONResponse> {
  log("Entered setJSONEncryptedInternal");

  validateString("path", path, "parameter");
  validateObject("json", json, "parameter");

  const { publicKey } = genKeyPairFromSeed(seed);
  const pathSeed = await getEncryptedPathSeedInternal(seed, path, false);
  const dataKey = deriveEncryptedFileTweak(pathSeed);
  const opts = { hashedDataKeyHex: true };

  // Immediately fail if the mutex is not available.
  return await client.db.revisionNumberCache.withCachedEntryLock(
    publicKey,
    dataKey,
    async (cachedRevisionEntry: { revision: bigint }) => {
      // Get the cached revision number before doing anything else.
      const newRevision = incrementRevision(cachedRevisionEntry.revision);

      // Derive the key.
      const encryptionKey = deriveEncryptedFileKeyEntropy(pathSeed);

      // Pad and encrypt json file.
      log("Calling encryptJSONFile");
      const data = encryptJSONFile(json, { version: ENCRYPTED_JSON_RESPONSE_VERSION }, encryptionKey);

      log("Calling getOrCreateSkyDBRegistryEntry");
      const [entry] = await getOrCreateSkyDBRegistryEntry(client, dataKey, data, newRevision, opts);

      // Sign the entry.
      log("Calling signEncryptedRegistryEntryInternal");
      const signature = await signEncryptedRegistryEntryInternal(seed, entry, path);

      log("Calling postSignedEntry");
      await client.registry.postSignedEntry(publicKey, entry, signature, opts);

      return { data: json };
    }
  );
}

/**
 * Gets the encrypted path seed for the given path without requiring
 * permissions. This should NOT be exported - for internal use only.
 *
 * @param seed - The root MySky user seed.
 * @param path - The given file or directory path.
 * @param isDirectory - Whether the path corresponds to a directory.
 * @returns - The hex-encoded encrypted path seed.
 */
async function getEncryptedPathSeedInternal(seed: Uint8Array, path: string, isDirectory: boolean): Promise<string> {
  log("Entered getEncryptedPathSeedInternal");

  // Compute the root path seed.
  const rootPathSeedBytes = deriveRootPathSeed(seed);

  // Compute the child path seed.
  return deriveEncryptedPathSeedForRoot(rootPathSeedBytes, path, isDirectory);
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

/**
 * Signs the encrypted registry entry without requiring permissions. For
 * internal use only.
 *
 * @param seed - The root MySky user seed.
 * @param entry - The encrypted registry entry.
 * @param path - The MySky path.
 * @returns - The signature.
 */
async function signEncryptedRegistryEntryInternal(
  seed: Uint8Array,
  entry: RegistryEntry,
  path: string
): Promise<Uint8Array> {
  log("Entered signEncryptedRegistryEntryInternal");

  // Check that the entry data key corresponds to the right path.
  //
  // Use `isDirectory: false` because registry entries can only correspond to files right now.
  const pathSeed = await getEncryptedPathSeedInternal(seed, path, false);
  const dataKey = deriveEncryptedFileTweak(pathSeed);
  if (entry.dataKey !== dataKey) {
    throw new Error("Path does not match the data key in the encrypted registry entry.");
  }

  return signRegistryEntryHelperInternal(seed, entry);
}

/**
 * Internal version of `signRegistryEntryHelper` that does not check for
 * permissions.
 *
 * @param seed - The root MySky user seed.
 * @param entry - The registry entry.
 * @returns - The signature.
 */
async function signRegistryEntryHelperInternal(seed: Uint8Array, entry: RegistryEntry): Promise<Uint8Array> {
  log("Entered signRegistryEntryHelperInternal");

  // Get the private key.
  const { privateKey } = genKeyPairFromSeed(seed);

  // Sign the entry.
  return await signEntry(privateKey, entry, true);
}
