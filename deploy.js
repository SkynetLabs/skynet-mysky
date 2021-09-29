const { SkynetClient: SkynetClientNode } = require("@skynetlabs/skynet-nodejs");
const { SkynetClient, genKeyPairFromSeed } = require("skynet-js");

const { cyan } = require("chalk");

// ===============================
// ===== CUSTOMIZABLE FIELDS =====
// ===============================

// URL of Skynet Portal you wish to use
const PORTAL = process.env.SKYNET_PORTAL || "https://siasky.net";

// Build directory.
const BUILD_DIR = process.env.BUILD_DIR || "./dist";

// Resolver datakey, e.g. "skynet-mysky". Allowed to be empty.
const RESOLVER_DATA_KEY = process.env.RESOLVER_DATA_KEY || "";

// Seed for generating and updating resolver skylink. Not allowed to be empty.
const RESOLVER_SEED = process.env.RESOLVER_SEED || "";

// A space-separated list of files that the portal should try when resolving a directory.
const TRY_FILES = process.env.TRY_FILES || "index.html";

// Defines a path to a file that will replace the default 404 Not Found error page, ie `404.html`.
const NOT_FOUND_PAGE = process.env.NOT_FOUND_PAGE;

// ===============================
// ===============================
// ===============================

// Create clients for upload and resolver skylink.
const client = new SkynetClient(PORTAL);
const nodeClient = new SkynetClientNode(PORTAL);

/**
 * Uploads the directory at the path.
 *
 * @param path - The directory path.
 * @returns - Returns the upload directory response.
 */
async function pushDirectoryToSkynet(path) {
  const response = await nodeClient.uploadDirectory(path, prepareUploadOptions());
  return response;
}

/**
 * Publishes the skylink to a resolver skylink.
 *
 * @param skylink - The data link to publish.
 * @param resolverSeed - The seed.
 * @param resolverDataKey - The data key.
 * @returns - The resolver skylink.
 */
async function publishSkylinkToResolverSkylink(skylink, resolverSeed, resolverDataKey) {
  // Setup Keys for Read/Write of Mutable Data
  const { privateKey, publicKey } = genKeyPairFromSeed(resolverSeed);
  const dataKey = resolverDataKey;

  // Set Registry Entry to point at our Skylink
  await client.db.setDataLink(privateKey, dataKey, skylink);

  // Get the resolver skylink that represents the registry entry
  const resolverSkylink = await client.registry.getEntryLink(publicKey, dataKey);

  return resolverSkylink;
}

/**
 * Deploys the build directory.
 *
 * @returns - An empty promise.
 */
async function deploy() {
  if (!RESOLVER_SEED) {
    throw new Error("RESOLVER_SEED env var not found");
  }

  console.log("Sending to Skynet...");
  const skylink = await pushDirectoryToSkynet(BUILD_DIR);
  let resolverSkylinkUrl = "";

  if (!skylink) {
    throw new Error("App deployment failed");
  }

  // Get URL based off preferred portal
  const skylinkUrl = await client.getSkylinkUrl(skylink, { subdomain: true });

  console.log(`📡 App deployed to Skynet with skylink: ${cyan(skylink)}`);

  console.log();

  // Call method to update resolver skylink.
  const resolverSkylink = await publishSkylinkToResolverSkylink(skylink, RESOLVER_SEED, RESOLVER_DATA_KEY);

  // Get URL based off preferred portal
  resolverSkylinkUrl = await client.getSkylinkUrl(resolverSkylink, { subdomain: true });

  console.log(`📡 Resolver skylink updated: ${cyan(resolverSkylink)}`);

  // Display final info.
  console.log("🚀 Deployment to Skynet complete!");
  console.log();
  console.log(`Use the link${resolverSkylinkUrl && "s"} below to access your app:`);
  console.log(`   Immutable Skylink Url: ${cyan(`${skylinkUrl}`)}`);
  console.log(`   Resolver Skylink Url: ${cyan(`${resolverSkylinkUrl}`)}`);
  console.log();
  console.log(
    'Each new deployment will have a unique skylink while the "resolver skylink" will always point at the most recent deployment.'
  );
  console.log(
    "It is recommended that you share the resolver skylink url so that people always see the newest version of your app."
  );
  console.log(
    "You can use the resolver skylink (starting with `sia://`) for setting ENS content hashes for a decentralized domain."
  );
  console.log();
}

void (async () => {
  try {
    await deploy();
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
})();

function prepareUploadOptions() {
  const options = {};

  if (TRY_FILES) {
    // transform try-files input which is space separated list
    // of file paths into an array of those paths
    options.tryFiles = TRY_FILES.split(/\s+/);
  }

  if (NOT_FOUND_PAGE) {
    // transform not-found-page input which is a single file path into
    // an object with a 404 key and its value being the specified path
    options.errorPages = { 404: NOT_FOUND_PAGE };
  }

  return options;
}
