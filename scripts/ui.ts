import { ChildHandshake, Connection, ParentHandshake, WindowMessenger } from "post-me";
import {
  CheckPermissionsResponse,
  createFullScreenIframe,
  defaultHandshakeAttemptsInterval,
  defaultHandshakeMaxAttempts,
  ErrorHolder,
  errorWindowClosed,
  monitorWindowError,
  Permission,
} from "skynet-mysky-utils";
import { SkynetClient } from "skynet-js";

import { saveSeed } from "../src/mysky";
import { defaultSeedDisplayProvider, loadPermissionsProvider } from "../src/provider";

let submitted = false;
const errorHolder = new ErrorHolder();
let parentConnection: Connection | null = null;

// ======
// Events
// ======

// Event that is triggered when the window is closed by the user.
window.onbeforeunload = () => {
  if (!submitted) {
    if (parentConnection) {
      // Send value to signify that the router was closed.
      parentConnection.remoteHandle().call("catchError", errorWindowClosed);
    }
  }

  return null;
};

window.onerror = function (error: any) {
  console.log(error);
  if (parentConnection) {
    if (typeof error === "string") {
      parentConnection.remoteHandle().call("catchError", error);
    } else {
      parentConnection.remoteHandle().call("catchError", error.type);
    }
  }
};

// TODO: Wrap in a try-catch block? Does onerror handler catch thrown errors?
// Code that runs on page load.
window.onload = () => {
  init();
};

// ==========
// Core logic
// ==========

async function init() {
  // Establish handshake with parent skapp.

  const messenger = new WindowMessenger({
    localWindow: window,
    remoteWindow: window.opener,
    remoteOrigin: "*",
  });
  const methods = {
    requestLoginAccess,
  };
  parentConnection = await ChildHandshake(messenger, methods);
}

async function requestLoginAccess(permissions: Permission[]): Promise<[boolean, CheckPermissionsResponse]> {
  // If we don't have a seed, show seed provider chooser.

  // TODO: We just use the default seed provider for now.
  const seedProviderUrl = `${window.location.hostname}/${defaultSeedDisplayProvider}`;

  // User has chosen seed provider, open seed provider display.

  console.log("Calling runSeedProviderDisplay");
  const seed = await runSeedProviderDisplay(seedProviderUrl);

  // Save the seed in local storage.

  console.log("Calling saveSeed");
  saveSeed(seed);

  // Open the permissions provider.

  console.log("Calling loadPermissionsProvider");
  const permissionsProvider = await loadPermissionsProvider(seed);

  // Pass it the requested permissions.

  console.log("Calling checkPermissions on permissions provider");
  const permissionsResponse: CheckPermissionsResponse = await permissionsProvider
    .remoteHandle()
    .call("checkPermissions", permissions);

  // TODO: If failed permissions, open the permissions provider display.

  // const { acceptedPermissions, rejectedPermissions } = await runPermissionProviderDisplay(permissionsProviderUrl);

  // TODO: Send the permissions provider worker the new and failed permissions.

  // Return remaining failed permissions to skapp.

  console.log("Returning permissions response");
  return [true, permissionsResponse];
}

async function runSeedProviderDisplay(seedProviderUrl: string): Promise<string> {
  // Add error listener.

  const { promise: promiseError, controller: controllerError } = monitorWindowError(errorHolder);

  let seedFrame: HTMLIFrameElement;
  let seedConnection: Connection;

  const promise: Promise<string> = new Promise(async (resolve, reject) => {
    // Make this promise run in the background and reject on window close or any errors.
    promiseError.catch((err: string) => {
      reject(err);
    });

    try {
      // Launch the full-screen iframe and connection.

      [seedFrame, seedConnection] = await launchSeedProvider(seedProviderUrl);

      // Call deriveRootSeed.

      // TODO: This should be a dual-promise that also calls ping() on an interval and rejects if no response was found in a given amount of time.
      const seed = await seedConnection.remoteHandle().call("getRootSeed");

      resolve(seed);
    } catch (err) {
      reject(err);
    }
  });

  return await promise
    .catch((err) => {
      throw err;
    })
    .finally(() => {
      // Close the iframe.
      if (seedFrame) {
        seedFrame.parentNode!.removeChild(seedFrame);
      }
      // Close the connection.
      if (seedConnection) {
        seedConnection.close();
      }
      // Clean up the event listeners and promises.
      controllerError.cleanup();
    });
}

async function launchSeedProvider(seedProviderUrl: string): Promise<[HTMLIFrameElement, Connection]> {
  // Create the iframe. FULL SCREEN!

  const childFrame = createFullScreenIframe(seedProviderUrl, seedProviderUrl);
  const childWindow = childFrame.contentWindow!;

  // Complete handshake with Seed Provider Display window.

  const messenger = new WindowMessenger({
    localWindow: window,
    remoteWindow: childWindow,
    remoteOrigin: "*",
  });
  const methods = {
    catchError,
  };
  // TODO: Get handshake values from optional fields.
  const connection = await ParentHandshake(
    messenger,
    methods,
    defaultHandshakeMaxAttempts,
    defaultHandshakeAttemptsInterval
  );

  return [childFrame, connection];
}

async function catchError(errorMsg: string) {
  errorHolder.error = errorMsg;
}

// ================
// Helper Functions
// ================
