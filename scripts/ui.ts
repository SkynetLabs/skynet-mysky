import { ChildHandshake, Connection, WindowMessenger } from "post-me";
import { Permission } from "skynet-interface-utils";
import { SkynetClient } from "skynet-js";
import urljoin from "url-join";

import { defaultSeedDisplayProvider, loadPermissionsProvider } from "../src/provider";

const seedKey = "seed";

let submitted = false;
let parentConnection: Connection | null = null;

// ======
// Events
// ======

// Event that is triggered when the window is closed by the user.
window.onbeforeunload = () => {
  if (!submitted) {
    // Send value to signify that the router was closed.
    parentConnection.localHandle().emit("error", "closed");
  }

  return null;
};

window.onerror = function (error) {
  if (typeof error === "string") {
    parentConnection.localHandle().emit("error", error);
  } else {
    parentConnection.localHandle().emit("error", error.type);
  }
  window.close();
};

// TODO: Wrap in a try-catch block? Does onerror handler catch thrown errors?
window.onload = async () => {
  init();
};

// ==========
// Core logic
// ==========

async function init() {
  const client = new SkynetClient();

  // Establish handshake with parent skapp.

  const messenger = new WindowMessenger({
    localWindow: window,
    remoteWindow: window.parent,
    remoteOrigin: "*",
  });
  const methods = {
    requestLoginAccess,
  };
  parentConnection = await ChildHandshake(messenger, methods);
}

async function requestLoginAccess(permissions: Permission[]): Promise<Permission[]> {
  // If we don't have a seed, show seed provider chooser.

  // TODO: We just use the default seed provider for now.
  const seedProviderUrl = defaultSeedDisplayProvider;

  // User has chosen seed provider, open seed provider display.

  const seed = await runSeedProviderDisplay(seedProviderUrl);

  // Save the seed in local storage.

  saveSeed(seed);

  // Open the permissions provider.

  const permissionsProvider = await loadPermissionsProvider(seed);

  // Pass it the requested permissions.

  const failedPermissions = await permissionsProvider.remoteHandle().call("checkPermissions", permissions);

  // TODO: If failed permissions, open the permissions provider display.

  // const { acceptedPermissions, rejectedPermissions } = await runPermissionProviderDisplay(permissionsProviderUrl);

  // TODO: Send the permissions provider worker the new and failed permissions.

  // Return remaining failed permissions to skapp.

  return failedPermissions;
}

// ================
// Helper Functions
// ================

/**
 * Stores the root seed in local storage.
 *
 * @param seed - The root seed.
 */
function saveSeed(seed: string): void {
  if (!localStorage) {
    console.log("WARNING: localStorage disabled, seed not stored");
    return;
  }

  localStorage.setItem(seedKey, seed);
}
