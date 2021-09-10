import { SkynetClient as SkynetClientNode } from "@skynetlabs/skynet-nodejs";
import { SkynetClient, genKeyPairFromSeed } from "skynet-js";

const chalk = require("chalk");
const { clearLine } = require("readline");

// URL of Skynet Portal you wish to use
const PORTAL = "https://siasky.net";

// Build directory.
const BUILD_DIR = "./dist";

// Create clients for upload and resolver skylink.
const client = new SkynetClient(PORTAL);
const nodeClient = new SkynetClientNode(PORTAL);

async function pushDirectoryToSkynet(path: string) {
  const response = await nodeClient.uploadDirectory(path);
  return response;
};

async function publishSkylinkToResolverSkylink(skylink: string, resolverSeed: string, resolverDataKey: string): Promise<string> {
  // Setup Keys for Read/Write of Mutable Data
  const { privateKey, publicKey } = genKeyPairFromSeed(resolverSeed);
  const dataKey = resolverDataKey;

  // Set Registry Entry to point at our Skylink
  await client.db.setDataLink(privateKey, dataKey, skylink);

  // Get the resolver skylink that represents the registry entry
  const resolverSkylink = await client.registry.getEntryLink(publicKey, dataKey);

  return resolverSkylink;
}

async function deploy(): Promise<void> {
  // Set seed for generating and updating resolver skylink.
  const resolverSeed = process.env.RESOLVER_SEED;
  if (!resolverSeed) {
    throw new Error("RESOLVER_SEED env var not found");
  }
  // Set dataKey for resolver skylink.
  let resolverDataKey = "skynet-mysky";
  if (process.env.DEV) {
    resolverDataKey = "skynet-mysky-dev";
  } else if (process.env.ALPHA) {
    resolverDataKey = "sandbridge";
  }

  console.log("Sending to Skynet...");
  const skylink = await pushDirectoryToSkynet(BUILD_DIR);
  let resolverSkylinkUrl = "";

  if (!skylink) {
    throw new Error("App deployment failed");
  }

  // Get URL based off preferred portal
  const skylinkUrl = await client.getSkylinkUrl(skylink, { subdomain: true });

  console.log(`📡 App deployed to Skynet with skylink: ${chalk.cyan(skylink)}`);

  console.log();

  // Call method to update resolver skylink.
  const resolverSkylink = await publishSkylinkToResolverSkylink(skylink, resolverSeed, resolverDataKey);

  // Get URL based off preferred portal
  resolverSkylinkUrl = await client.getSkylinkUrl(resolverSkylink, { subdomain: true });

  console.log(`📡 Resolver skylink updated: ${chalk.cyan(resolverSkylink)}`);

  // Display final info.
  console.log("🚀 Deployment to Skynet complete!");
  console.log();
  console.log(`Use the link${resolverSkylinkUrl && "s"} below to access your app:`);
  console.log(`   Immutable Skylink Url: ${chalk.cyan(`${skylinkUrl}`)}`);
  console.log(`   Resolver Skylink Url: ${chalk.cyan(`${resolverSkylinkUrl}`)}`);
  console.log();
  console.log(
    'Each new deployment will have a unique skylink while the "resolver skylink" will always point at the most recent deployment.',
  );
  console.log(
    "It is recommended that you share the resolver skylink url so that people always see the newest version of your app.",
  );
  console.log(
    "You can use the resolver skylink (starting with `sia://`) for setting ENS content hashes for a decentralized domain.",
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
