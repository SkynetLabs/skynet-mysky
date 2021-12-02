import { ChildHandshake, Connection, ParentHandshake, WindowMessenger } from "post-me";
import {
  CheckPermissionsResponse,
  createFullScreenIframe,
  defaultHandshakeAttemptsInterval,
  defaultHandshakeMaxAttempts,
  dispatchedErrorEvent,
  errorWindowClosed,
  monitorWindowError,
  Permission,
} from "skynet-mysky-utils";
import { MySky, SkynetClient } from "skynet-js";

import { hashSeedWithSalt } from "../src/crypto";
import { register } from "../src/login";
import { checkStoredSeed, JWT_STORAGE_KEY, SEED_STORAGE_KEY } from "../src/mysky";
import {
  getPermissionsProviderUrl,
  relativePermissionsDisplayUrl,
  defaultSeedDisplayProvider,
  launchPermissionsProvider,
} from "../src/provider";
import { log } from "../src/util";

const RELATIVE_SEED_SELECTION_DISPLAY_URL = "seed-selection.html";

const client = new SkynetClient();
let parentConnection: Connection | null = null;

// Set value of dev on load.
let dev = false;

// ======
// Events
// ======

// Event that is triggered when the window is closed by the user.
window.addEventListener("beforeunload", function (event) {
  // Cancel the event
  event.preventDefault();

  if (parentConnection) {
    // Send value to signify that the router was closed.
    void parentConnection.remoteHandle().call("catchError", errorWindowClosed);
  }

  window.close();
  return null;
});

window.onerror = function (error: any) {
  console.log(error);
  if (parentConnection) {
    if (typeof error === "string") {
      void parentConnection.remoteHandle().call("catchError", error);
    } else {
      void parentConnection.remoteHandle().call("catchError", error.type);
    }
  }
};

// TODO: Wrap in a try-catch block? Does onerror handler catch thrown errors?
// Code that runs on page load.
window.onload = () => {
  /// #if ENV == 'dev'
  dev = true;
  /// #endif

  void init();
};

// ==============
// Initialization
// ==============

/**
 * Initializes the page.
 */
async function init(): Promise<void> {
  if (!window.opener) {
    throw new Error("Window opener not found");
  }

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

// ==========
// Public API
// ==========

/**
 * Requests login access with the given permissions.
 *
 * @param permissions - The requested permissions.
 * @returns - Whether the user was logged in and the granted and rejected permissions.
 */
async function requestLoginAccess(permissions: Permission[]): Promise<[boolean, CheckPermissionsResponse]> {
  // Before doing anything, check if the browser is supported.

  const [isSupported, reason] = await MySky.isBrowserSupported();
  if (!isSupported) {
    alert(reason);
    throw new Error(reason);
  }

  // Get the seed and email.

  let seed = checkStoredSeed();

  // If we don't have a seed, get it from the seed provider. We will also get
  // the email if the user is signing up for the first time.
  if (!seed) {
    // Show seed provider chooser.

    const seedProviderDisplayUrl = await getSeedProviderDisplayUrl();

    // User has chosen seed provider, open seed provider display.

    log("Calling runSeedProviderDisplay");
    let email = null;
    [seed, email] = await runSeedProviderDisplay(seedProviderDisplayUrl);

    // Register and get the JWT.
    let jwt = null;
    if (email) {
      jwt = await register(client, seed, email);
    }

    // Save the seed and jwt in local storage.

    log("Calling saveSeed");
    saveSeed(seed, jwt);
  }

  // Open the permissions provider.

  log("Calling launchPermissionsProvider");
  const permissionsProvider = await launchPermissionsProvider(seed);

  // Pass it the requested permissions.

  log("Calling checkPermissions on permissions provider");
  let permissionsResponse: CheckPermissionsResponse = await permissionsProvider.connection
    .remoteHandle()
    .call("checkPermissions", permissions, dev);

  // If failed permissions, query the user in the permissions provider display.
  if (permissionsResponse.failedPermissions.length > 0) {
    // Open the permissions provider display.

    permissionsResponse = await runPermissionsProviderDisplay(seed, permissionsResponse.failedPermissions);

    // Send the permissions provider worker the new and failed permissions.

    await permissionsProvider.connection.remoteHandle().call("setPermissions", permissionsResponse.grantedPermissions);
  }

  // Terminate the returned permissions worker.
  permissionsProvider.close();

  // Return remaining failed permissions to skapp.

  log("Returning permissions response");
  return [true, permissionsResponse];
}

// ==========
// Core Logic
// ==========

/**
 * Gets the user's seed provider display URL if set, or the default.
 *
 * @returns - The seed provider display URL.
 */
async function getSeedProviderDisplayUrl(): Promise<string> {
  // Run the seed selection display.

  // const seedProvider = await runSeedSelectionDisplay();
  const seedProvider = "default";

  if (seedProvider === "default") {
    // Return the default seed provider.
    return `${window.location.hostname}/${defaultSeedDisplayProvider}`;
  }

  return await client.getFullDomainUrl(seedProvider);
}

/**
 * Runs the permissions provider display and returns with the granted and rejected permissions.
 *
 * @param seed - The user seed.
 * @param pendingPermissions - The pending permissions.
 * @returns - The granted and rejected permissions.
 */
async function runPermissionsProviderDisplay(
  seed: Uint8Array,
  pendingPermissions: Permission[]
): Promise<CheckPermissionsResponse> {
  const permissionsProviderUrl = await getPermissionsProviderUrl(seed);
  const permissionsProviderDisplayUrl = `${permissionsProviderUrl}/${relativePermissionsDisplayUrl}`;

  // Add error listener.

  const { promise: promiseError, controller: controllerError } = monitorWindowError();

  let permissionsFrame: HTMLIFrameElement;
  let permissionsConnection: Connection;

  // eslint-disable-next-line no-async-promise-executor
  const promise: Promise<CheckPermissionsResponse> = new Promise(async (resolve, reject) => {
    // Make this promise run in the background and reject on window close or any errors.
    promiseError.catch((err: string) => {
      reject(err);
    });

    try {
      // Launch the full-screen iframe and connection.

      permissionsFrame = launchDisplay(permissionsProviderDisplayUrl);
      permissionsConnection = await connectProvider(permissionsFrame);

      // Get the response.

      // TODO: This should be a dual-promise that also calls ping() on an interval and rejects if no response was found in a given amount of time.
      const permissionsResponse = await permissionsConnection
        .remoteHandle()
        .call("getPermissions", pendingPermissions, document.referrer);

      resolve(permissionsResponse);
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
      if (permissionsFrame) {
        permissionsFrame.parentNode!.removeChild(permissionsFrame);
      }
      // Close the connection.
      if (permissionsConnection) {
        permissionsConnection.close();
      }
      // Clean up the event listeners and promises.
      controllerError.cleanup();
    });
}

/**
 * Runs the seed provider display and returns with the user seed.
 *
 * @param seedProviderDisplayUrl - The seed provider display URL.
 * @returns - The user seed as bytes and the email.
 */
async function runSeedProviderDisplay(seedProviderDisplayUrl: string): Promise<[Uint8Array, string | null]> {
  // Add error listener.

  const { promise: promiseError, controller: controllerError } = monitorWindowError();

  let seedFrame: HTMLIFrameElement;
  let seedConnection: Connection;

  // eslint-disable-next-line no-async-promise-executor
  const promise: Promise<[Uint8Array, string | null]> = new Promise(async (resolve, reject) => {
    // Make this promise run in the background and reject on window close or any errors.
    promiseError.catch((err: string) => {
      reject(err);
    });

    try {
      // Launch the full-screen iframe and connection.

      seedFrame = launchDisplay(seedProviderDisplayUrl);
      seedConnection = await connectProvider(seedFrame);

      // Get the response.

      // TODO: This should be a dual-promise that also calls ping() on an interval and rejects if no response was found in a given amount of time.
      const [seed, email] = await seedConnection.remoteHandle().call("getRootSeedAndEmail");

      resolve([seed, email]);
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

/**
 * Runs the seed provider selection display and returns with the seed provider.
 *
 * @returns - The seed provider.
 */
async function _runSeedSelectionDisplay(): Promise<string> {
  // Get the display URL.

  const seedSelectionDisplayUrl = `${window.location.hostname}/${RELATIVE_SEED_SELECTION_DISPLAY_URL}`;

  // Add error listener.

  const { promise: promiseError, controller: controllerError } = monitorWindowError();

  let seedFrame: HTMLIFrameElement;
  let seedConnection: Connection;

  // eslint-disable-next-line no-async-promise-executor
  const promise: Promise<string> = new Promise(async (resolve, reject) => {
    // Make this promise run in the background and reject on window close or any errors.
    promiseError.catch((err: string) => {
      reject(err);
    });

    try {
      // Launch the full-screen iframe and connection.

      seedFrame = launchDisplay(seedSelectionDisplayUrl);
      seedConnection = await connectProvider(seedFrame);

      // Get the response.

      // TODO: This should be a dual-promise that also calls ping() on an interval and rejects if no response was found in a given amount of time.
      const seed = await seedConnection.remoteHandle().call("getSeedProvider");

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

/**
 * Launches the provider display at the given URL.
 *
 * @param displayUrl - The display URL.
 * @returns - The display iframe.
 */
function launchDisplay(displayUrl: string): HTMLIFrameElement {
  // Create the iframe. FULL SCREEN!

  const childFrame = createFullScreenIframe(displayUrl, displayUrl);
  return childFrame;
}

/**
 * Connects to the provider at the given iframe.
 *
 * @param childFrame - The iframe to connect.
 * @returns - The connection.
 */
async function connectProvider(childFrame: HTMLIFrameElement): Promise<Connection> {
  const childWindow = childFrame.contentWindow!;

  // Complete handshake with Provider Display window.

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

  return connection;
}

/**
 * Catches any errors that occur in the child connection.
 *
 * @param errorMsg - The error message.
 */
async function catchError(errorMsg: string): Promise<void> {
  const event = new CustomEvent(dispatchedErrorEvent, { detail: errorMsg });
  window.dispatchEvent(event);
}

/**
 * Stores the root seed in local storage. This triggers the storage event
 * listener in the invisible MySky frame.
 *
 * NOTE: If ENV == 'dev' the seed is salted before storage.
 *
 * @param seed - The root seed.
 * @param jwt - The jwt.
 */
export function saveSeed(seed: Uint8Array, jwt: string | null): void {
  if (!localStorage) {
    console.log("WARNING: localStorage disabled, seed not stored");
    return;
  }

  // If in dev mode, salt the seed.
  if (dev) {
    seed = saltSeedDevMode(seed);
  }

  // Set the jwt first.
  if (jwt) {
    localStorage.setItem(JWT_STORAGE_KEY, jwt);
  }

  // Set the seed, triggering the storage event.
  localStorage.setItem(SEED_STORAGE_KEY, JSON.stringify(Array.from(seed)));
}

/**
 * Salts the given seed for developer mode.
 *
 * @param seed - The seed to salt.
 * @returns - The new seed after being salted.
 */
function saltSeedDevMode(seed: Uint8Array): Uint8Array {
  const hash = hashSeedWithSalt(seed, "developer mode");
  return hash.slice(0, 16);
}
