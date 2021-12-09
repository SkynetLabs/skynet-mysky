import { deriveEncryptedPathSeed, ENCRYPTION_PATH_SEED_DIRECTORY_LENGTH } from "skynet-js";

import { deriveEncryptedPathSeedForRoot, ENCRYPTION_ROOT_PATH_SEED_BYTES_LENGTH } from "../../src/encrypted_files";
import { toHexString } from "../../src/util";

describe("deriveEncryptedPathSeedForRoot", () => {
  // ====================
  // Tests From skynet-js
  // ====================

  // Hard-code expected value to catch breaking changes.
  const rootPathSeedBytes = new Uint8Array(ENCRYPTION_ROOT_PATH_SEED_BYTES_LENGTH);
  const subPath = "path/to/file.json";
  const expectedDirectorySeed =
    "435426f029b213c86e5a931056cc567cdeb9f37f35185e7b4d3af2f5e2fc245b938eedeb0d61ef070159394afb6dea9f87bdd767011b2685bd72fb346102f850";
  const expectedFileSeed = "3f4cd61232221728b37ba106d795ef2ecef067582b7ca89b32e477808b47565b";

  it("should derive the correct encrypted file seed for a file", () => {
    // Derive seed for a file.
    const fileSeed = deriveEncryptedPathSeedForRoot(rootPathSeedBytes, subPath, false);

    expect(fileSeed).toEqual(expectedFileSeed);
  });

  it("should derive the correct encrypted file seed for a directory", () => {
    // Derive seed for a directory.
    const directorySeed = deriveEncryptedPathSeedForRoot(rootPathSeedBytes, subPath, true);

    expect(directorySeed).toEqual(expectedDirectorySeed);
  });

  /**
   * Regression test:
   *
   * The issue was that `deriveEncryptedPathSeed` calculated path seeds of 64
   * bytes internally for each directory and then truncated to 32 bytes at the
   * end. For example, the path seed for `path/foo/bar.json` was 64 bytes for
   * `path`, 64 for `foo` and 32 for `bar.json` (which is the final output).
   * However, you could request the path seed for `path` which would give you a
   * 32-byte truncated seed. If you then tried to use that and requested
   * `foo/bar.json` for `path`, you would end up with a different seed than for
   * `path/foo/bar.json`. The fix is to keep truncating to 32 bytes for files,
   * but change the output to the full 64 bytes for directories.
   */
  it("should result in the same path seed when deriving path for directory first", () => {
    // Derive seed for directory first.
    const directorySeed = deriveEncryptedPathSeedForRoot(rootPathSeedBytes, "path/to", true);

    // Derive seed for file.
    const fileSeed = deriveEncryptedPathSeed(directorySeed, "file.json", false);

    expect(fileSeed).toEqual(expectedFileSeed);
  });

  const directoryPathSeedBytes = new Uint8Array(ENCRYPTION_PATH_SEED_DIRECTORY_LENGTH / 2);
  const pathSeedError = "Expected parameter 'pathSeed' to be root path seed bytes of length '32'";

  // [pathSeed, subPath, isDirectory]
  const validTestCases: Array<[Uint8Array, string, boolean]> = [
    // should accept standard paths
    [rootPathSeedBytes, "path/file.json", false],
    [rootPathSeedBytes, "path", true],
    [rootPathSeedBytes, "path", false],
    // should accept funny-looking but valid sub paths
    [rootPathSeedBytes, "path/file.json/bar", true],
    [rootPathSeedBytes, "path/file.json/bar", false],
    [rootPathSeedBytes, "path//to/file.json", true],
    [rootPathSeedBytes, "path//to/file.json", false],
  ];

  it.each(validTestCases)(
    "deriveEncryptedPathSeedForRoot(%s, %s, %s) should not throw",
    (pathSeed, subPath, isDirectory) => {
      deriveEncryptedPathSeedForRoot(pathSeed, subPath, isDirectory);
    }
  );

  // [pathSeed, subPath, isDirectory, error]
  const invalidTestCases: Array<[Uint8Array, string, boolean, string]> = [
    // should throw for invalid input sub paths
    [rootPathSeedBytes, "", true, "Input subPath '' not a valid path"],
    [rootPathSeedBytes, "", false, "Input subPath '' not a valid path"],
    [rootPathSeedBytes, "/", true, "Input subPath '/' not a valid path"],
    [rootPathSeedBytes, "/", false, "Input subPath '/' not a valid path"],
    [rootPathSeedBytes, " ", true, "Input subPath ' ' not a valid path"],
    [rootPathSeedBytes, " ", false, "Input subPath ' ' not a valid path"],
    [rootPathSeedBytes, " / ", true, "Input subPath ' / ' not a valid path"],
    [rootPathSeedBytes, " / ", false, "Input subPath ' / ' not a valid path"],
    // should not accept directory path seeds
    [directoryPathSeedBytes, "path/to/file", true, pathSeedError],
    [directoryPathSeedBytes, "path/to/file", false, pathSeedError],
    // should not accept other non-directory path seeds
    [new Uint8Array(31), "path/to/file", true, pathSeedError],
    [new Uint8Array(33), "path/to/file", false, pathSeedError],
    [new Uint8Array(63), "", true, pathSeedError],
    [new Uint8Array(65), "", false, pathSeedError],
    [new Uint8Array(63), "path", true, pathSeedError],
    [new Uint8Array(65), "path", false, pathSeedError],
    [new Uint8Array(0), "path/to/file", true, pathSeedError],
    [new Uint8Array(0), "path/to/file", false, pathSeedError],
  ];

  it.each(invalidTestCases)(
    "deriveEncryptedPathSeedForRoot(%s, %s, %s) should throw with error %s",
    (pathSeed, subPath, isDirectory, error) => {
      expect(() => deriveEncryptedPathSeedForRoot(pathSeed, subPath, isDirectory)).toThrowError(error);
    }
  );

  // =============================
  // Tests Specific For Root Seeds
  // =============================

  const rootPathSeedLeakCases: Array<[Uint8Array, string, boolean]> = [
    [rootPathSeedBytes, ".", true],
    [rootPathSeedBytes, ".", false],
    // Other cases that were tried:
    // - "" is not a valid path and is tested above.
    // - "/" is not a valid path and is tested above.
    // - " " is not a valid path and is tested above.
    // - " / " is not a valid path and is tested above.
  ];

  // Test that we can't make the root path seed leak.
  it.each(rootPathSeedLeakCases)(
    "deriveEncryptedPathSeedForRoot(%s, %s, %s) should not leak the root path seed bytes",
    (rootSeedBytes, subPath, isDirectory) => {
      const pathSeed = deriveEncryptedPathSeedForRoot(rootSeedBytes, subPath, isDirectory);
      expect(pathSeed).not.toEqual(toHexString(rootSeedBytes));
    }
  );
});
