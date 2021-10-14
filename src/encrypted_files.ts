import { ENCRYPTION_PATH_SEED_FILE_LENGTH } from "skynet-js";
import { sanitizePath } from "skynet-mysky-utils";

import { sha512 } from "./crypto";
import { stringToUint8ArrayUtf8, toHexString } from "./util";

/**
 * The length of the root path seed raw bytes.
 */
export const ENCRYPTION_ROOT_PATH_SEED_BYTES_LENGTH = 32;

// Descriptive salt that should not be changed.
const SALT_ENCRYPTED_CHILD = "encrypted filesystem child";

type DerivationPathObject = {
  pathSeed: Uint8Array;
  directory: boolean;
  name: string;
};

/**
 * Derives the path seed for the path, given the starting root path seed and
 * whether it is a directory.
 *
 * @see - `deriveEncryptedPathSeed` in skynet-js.
 * @param rootSeedBytes - The given root seed bytes.
 * @param subPath - The path.
 * @param isDirectory - Whether the path is a directory.
 * @returns - The path seed for the given path.
 * @throws - Will throw if the input sub path is not a valid path.
 */
export function deriveEncryptedPathSeedForRoot(
  rootSeedBytes: Uint8Array,
  subPath: string,
  isDirectory: boolean
): string {
  // The path seed must be for a directory and not a file.
  if (rootSeedBytes.length !== ENCRYPTION_ROOT_PATH_SEED_BYTES_LENGTH) {
    throw new Error("Expected parameter 'pathSeed' to be a root path seed of length '128'");
  }

  let pathSeedBytes = rootSeedBytes;
  const sanitizedPath = sanitizePath(subPath);
  if (sanitizedPath === null) {
    throw new Error(`Input subPath '${subPath}' not a valid path`);
  }
  const names = sanitizedPath.split("/");

  names.forEach((name: string, index: number) => {
    const directory = index === names.length - 1 ? isDirectory : true;
    const derivationPathObj: DerivationPathObject = {
      pathSeed: pathSeedBytes,
      directory,
      name,
    };
    const derivationPath = hashDerivationPathObject(derivationPathObj);
    const bytes = new Uint8Array([...sha512(SALT_ENCRYPTED_CHILD), ...derivationPath]);
    pathSeedBytes = sha512(bytes);
  });

  // Truncate the path seed bytes for files only.
  if (!isDirectory) {
    // Divide `ENCRYPTION_PATH_SEED_FILE_LENGTH` by 2 since that is the final hex-encoded length.
    pathSeedBytes = pathSeedBytes.slice(0, ENCRYPTION_PATH_SEED_FILE_LENGTH / 2);
  }
  // Hex-encode the final output.
  return toHexString(pathSeedBytes);
}

/**
 * Hashes the derivation path object.
 *
 * @param obj - The given object containing the derivation path.
 * @returns - The hash.
 */
function hashDerivationPathObject(obj: DerivationPathObject): Uint8Array {
  const bytes = new Uint8Array([...obj.pathSeed, obj.directory ? 1 : 0, ...stringToUint8ArrayUtf8(obj.name)]);
  return sha512(bytes);
}
