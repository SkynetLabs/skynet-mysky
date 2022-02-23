/**
 * @file Contains logic for the MySky UI window. The UI calls into sub-screens,
 * like the seed selection screen, as full-screen iframes and gets the response.
 *
 * The MySky UI is launched by the skapp when it calls
 * `mySky.requestLoginAccess`. This method launches a new window, navigates to
 * the MySky UI URL, and waits for a response from `requestLoginAccess` defined
 * in this file.
 */

import { ChildHandshake, Connection, ParentHandshake, WindowMessenger } from "post-me";
import {
  CheckPermissionsResponse,
  createFullScreenIframe,
  defaultHandshakeAttemptsInterval,
  defaultHandshakeMaxAttempts,
  dispatchedErrorEvent,
  ensureUrl,
  errorWindowClosed,
  monitorWindowError,
  Permission,
} from "skynet-mysky-utils";
import { MySky, SkynetClient } from "skynet-js";

import { hashWithSalt } from "../src/crypto";
import {
  checkStoredSeed,
  getCurrentAndReferrerDomains,
  INITIAL_PORTAL,
  LOGIN_RESPONSE_KEY,
  PortalAccountLoginResponse,
  LoginResponse,
  PORTAL_ACCOUNT_LOGIN_RESPONSE_KEY,
  SEED_STORAGE_KEY,
  PORTAL_CONNECT_RESPONSE_STORAGE_KEY,
} from "../src/mysky";
import {
  getPermissionsProviderUrl,
  relativePermissionsDisplayUrl,
  defaultSeedDisplayProvider,
  launchPermissionsProvider,
  SeedProviderResponse,
  PortalConnectResponse,
} from "../src/provider";
import { log } from "../src/util";
import { getUserSettings } from "../src/user_data";

const RELATIVE_SEED_SELECTION_DISPLAY_URL = "seed-selection.html";
const RELATIVE_PORTAL_CONNECT_DISPLAY_URL = "portal-connect.html";

const MYSKY_PORTAL_LOGIN_TIMEOUT = 30000;

// Create a client on the current portal.
const client = new SkynetClient();
let parentConnection: Connection | null = null;

// Set value of dev on load.
let dev = false;
/// #if ENV == 'dev'
dev = true;
/// #endif

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
  console.warn(error);
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
 * Flow:
 *
 * 0. Check if the browser supports MySky and throw an error if not.
 *
 * 1. Get the seed, first checking local storage and then querying the user if
 * it wasn't found.
 *
 * 2. Save the seed in local storage, triggering a login in Main MySky.
 *
 * 3. Waits for Main MySky to login successfully. At this point, Main MySky has
 * the user seed and has loaded the permission provider.
 *
 * 4. If a portal account was not found, asks the user to connect to a portal
 * account.
 *
 * 5. Saves the nickname in local storage, triggering a portal account login in
 * Main MySky.
 *
 * 6. If there are permissions that haven't been granted, asks the user to grant
 * them. Saves the new permissions in MySky's IndexedDB.
 *
 * 7. Returns the remaining failed permissions to the skapp.
 *
 * @param permissions - The requested permissions.
 * @returns - Whether the user was logged in, and the granted and rejected permissions.
 */
async function requestLoginAccess(permissions: Permission[]): Promise<[boolean, CheckPermissionsResponse]> {
  // Before doing anything, check if the browser is supported.
  await checkBrowserSupported();

  // Get the seed.
  const seed = await getSeed();

  // Save the seed in local storage, triggering a login in Main MySky.
  saveSeedInStorage(seed);

  // Wait for Main MySky to login successfully.
  const portalAccountFound = await resolveOnMySkyLogin();

  if (!portalAccountFound) {
    // Ask the user to connect to a portal account.
    const portalConnectResponse = await getPortalConnectResponseFromProvider();

    if (portalConnectResponse.nickname) {
      // Save the nickname in local storage, triggering a portal account login
      // in Main MySky.
      savePortalConnectResponseInStorage(portalConnectResponse);
    }

    // Wait for Main MySky to login to the portal account successfully.
    await resolveOnMySkyPortalAccountLogin();
  }

  // Pass in requested permissions and get a permissions response.
  const permissionsResponse = await getPermissions(seed, permissions);

  // Return remaining failed permissions to skapp.
  log("Returning permissions response");
  return [true, permissionsResponse];
}

// ==========
// Core Logic
// ==========

/**
 * Check if the browser is supported and throw an error if not.
 *
 * @throws - Will throw if the browser is not supported.
 */
async function checkBrowserSupported(): Promise<void> {
  const [isSupported, reason] = await MySky.isBrowserSupported();
  if (!isSupported) {
    alert(reason);
    throw new Error(reason);
  }
}

/**
 * Gets the user seed.
 *
 * Flow:
 *
 * 1. Check for the seed in local storage.
 *
 * 2. If the seed is not found, get it from a seed provider.
 *
 * (3. We return the seed and save it in storage in another function, which
 * triggers Main MySky's storage listener.)
 *
 * @returns - The seed.
 */
async function getSeed(): Promise<Uint8Array> {
  let seed = checkStoredSeed();

  // If we don't have a seed, get it from the seed provider.
  if (!seed) {
    const resp = await getSeedFromProvider();
    seed = resp.seed;
  }

  return seed;
}

/**
 * Tries to get a seed from a seed provider.
 *
 * @returns - The full seed provider response.
 */
async function getSeedFromProvider(): Promise<SeedProviderResponse> {
  // Show seed provider chooser.
  const seedProviderDisplayUrl = ensureUrl(await getSeedProviderDisplayUrl());

  // User has chosen seed provider, open seed provider display.
  log("Calling runSeedProviderDisplay");
  return await runSeedProviderDisplay(seedProviderDisplayUrl);
}

/**
 * Tries to get a portal connect response from a portal connect provider.
 *
 * @returns - the full portal connect response.
 */
async function getPortalConnectResponseFromProvider(): Promise<PortalConnectResponse> {
  log("Calling runPortalConnectProviderDisplay");
  return await runPortalConnectProviderDisplay();
}

/**
 * Launch the permissions provider and get any ungranted permissions. Show
 * permissions to user and get their response.
 *
 * @param seed - The user seed.
 * @param permissions - The full list of permissions requested by the skapp.
 * @returns - The permissions response.
 */
async function getPermissions(seed: Uint8Array, permissions: Permission[]): Promise<CheckPermissionsResponse> {
  log("Entered getPermissions");

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

  return permissionsResponse;
}

/**
 * Gets the user's seed provider display URL if set, or the default.
 *
 * @returns - The seed provider display URL.
 */
async function getSeedProviderDisplayUrl(): Promise<string> {
  // Run the seed selection display.

  // REMOVED: Not implemented yet.
  // const seedProvider = await runSeedSelectionDisplay();
  const seedProvider = "default";

  if (seedProvider === "default") {
    // Return the default seed provider.
    return `${window.location.hostname}/${defaultSeedDisplayProvider}`;
  }

  return await client.getFullDomainUrl(seedProvider);
}

/**
 * Gets the signin connect display URL.
 *
 * @returns - The URL.
 */
async function getPortalConnectProviderDisplayUrl(): Promise<string> {
  return ensureUrl(`${window.location.hostname}/${RELATIVE_PORTAL_CONNECT_DISPLAY_URL}`);
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
  const permissionsProviderDisplayUrl = ensureUrl(`${permissionsProviderUrl}/${relativePermissionsDisplayUrl}`);

  return setupAndRunDisplay(permissionsProviderDisplayUrl, "getPermissions", pendingPermissions, document.referrer);
}

/**
 * Runs the seed provider display and returns with the user seed.
 *
 * @param seedProviderDisplayUrl - The seed provider display URL.
 * @returns - The user seed as bytes and the user action.
 */
async function runSeedProviderDisplay(seedProviderDisplayUrl: string): Promise<SeedProviderResponse> {
  return setupAndRunDisplay(seedProviderDisplayUrl, "getSeedProviderResponse");
}

/**
 * Runs the seed provider selection display and returns with the seed provider.
 *
 * @returns - The seed provider.
 */
async function _runSeedSelectionDisplay(): Promise<string> {
  // Get the display URL.

  const seedSelectionDisplayUrl = ensureUrl(`${window.location.hostname}/${RELATIVE_SEED_SELECTION_DISPLAY_URL}`);

  return setupAndRunDisplay(seedSelectionDisplayUrl, "getSeedProvider");
}

/**
 * Runs the portal connect display and returns with the nickname, if provided.
 *
 * @returns - The seed provider.
 */
async function runPortalConnectProviderDisplay(): Promise<PortalConnectResponse> {
  const portalConnectDisplayUrl = ensureUrl(await getPortalConnectProviderDisplayUrl());

  return setupAndRunDisplay<PortalConnectResponse>(portalConnectDisplayUrl, "getPortalConnectResponse");
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
async function connectDisplayProvider(childFrame: HTMLIFrameElement): Promise<Connection> {
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
 * Sets up and runs a display in a new full-screen iframe. Calls the specified method on the iframe and waits for a response.
 *
 * @param displayUrl - The full URL of the display.
 * @param methodName - The name of the method on the iframe to call over the handshake connection.
 * @param methodParams - Any parameters to pass to the method on the iframe.
 * @returns - The response from the display iframe.
 */
async function setupAndRunDisplay<T>(displayUrl: string, methodName: string, ...methodParams: unknown[]): Promise<T> {
  // Add debug parameter to the URL.
  const displayUrlObject = new URL(displayUrl);
  displayUrlObject.search = window.location.search;
  displayUrl = displayUrlObject.toString();

  // Add error listener.
  const { promise: promiseError, controller: controllerError } = monitorWindowError();

  let frame: HTMLIFrameElement;
  let connection: Connection;

  // eslint-disable-next-line no-async-promise-executor
  const promise: Promise<T> = new Promise(async (resolve, reject) => {
    // Make this promise run in the background and reject on window close or any errors.
    promiseError.catch((err: string) => {
      reject(err);
    });

    try {
      // Launch the full-screen iframe and connection.
      frame = launchDisplay(displayUrl);
      connection = await connectDisplayProvider(frame);

      // Get the response.
      //
      // TODO: This should be a dual-promise that also calls ping() on an interval and rejects if no response was found in a given amount of time.
      log(`Calling method ${methodName} in iframe`);
      const response = await connection.remoteHandle().call(methodName, ...methodParams);

      resolve(response);
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
      if (frame) {
        frame.parentNode!.removeChild(frame);
      }
      // Close the connection.
      if (connection) {
        connection.close();
      }
      // Clean up the event listeners and promises.
      controllerError.cleanup();
    });
}

/**
 * Resolves when login on Main MySky completes successfully.
 *
 * We register a storage event listener inside a promise that resolves the
 * promise when we detect a successful portal login. The successful login is
 * signaled via local storage. If a successful login is not detected within a
 * given timeout, then we reject the promise.
 *
 * @returns - Whether a portal account was found.
 */
async function resolveOnMySkyLogin(): Promise<boolean> {
  log("Entered resolveOnMySkyLogin");

  return resolveOnMySkyResponse(LOGIN_RESPONSE_KEY, (resolve, reject, newValue) => {
    const response: LoginResponse | null = JSON.parse(newValue);
    if (!response) {
      reject(`Could not parse '${newValue}' as JSON`);
      return;
    }
    const { succeeded, portalAccountFound, error } = response;

    // Check for errors from Main MySky.
    if (!succeeded) {
      reject(error || "Missing error message (likely developer error)");
      return;
    }

    // We got the value signaling a successful login, resolve the promise.
    resolve(portalAccountFound);
  });
}

/**
 * Resolves when portal account login on Main MySky completes successfully.
 *
 * We register a storage event listener inside a promise that resolves the
 * promise when we detect a successful portal account login login. The
 * successful login is signaled via local storage. If a successful login is not
 * detected within a given timeout, then we reject the promise.
 *
 * @returns - An empty promise.
 */
async function resolveOnMySkyPortalAccountLogin(): Promise<void> {
  log("Entered resolveOnMySkyPortalAccountLogin");

  return resolveOnMySkyResponse(PORTAL_ACCOUNT_LOGIN_RESPONSE_KEY, (resolve, reject, newValue) => {
    const response: PortalAccountLoginResponse | null = JSON.parse(newValue);
    if (!response) {
      reject(`Could not parse '${newValue}' as JSON`);
      return;
    }
    const { succeeded, error } = response;

    // Check for errors from Main MySky.
    if (!succeeded) {
      reject(error || "Missing error message (likely developer error)");
      return;
    }

    // We got the value signaling a successful login, resolve the promise.
    resolve();
  });
}

/**
 * Resolves when an expected response is returned from Main MySky.
 *
 * We register a storage event listener inside a promise that resolves the
 * promise when we detect a successful response. The response is signaled via
 * local storage. If a successful response is not detected within a given
 * timeout, then we reject the promise.
 *
 * @param expectedKey - The expected local storage key that we should listen for.
 * @param responseFn - The function to call when a response from Main MySky is found.
 * @returns - The response from Main MySky, if successful.
 */
async function resolveOnMySkyResponse<T>(
  expectedKey: string,
  responseFn: (resolve: (value: T) => void, reject: (reason: string) => void, newValue: string) => void
): Promise<T> {
  const abortController = new AbortController();

  // Set up a promise that succeeds on successful response from Main MySky, and
  // fails when Main MySky returns an error.
  const promise1 = new Promise<T>((resolve, reject) => {
    const handleEvent = async ({ key, newValue }: StorageEvent) => {
      // We only want the promise to resolve or reject when the right storage
      // key is encountered. Any other storage key shouldn't trigger a `resolve`.
      if (key !== expectedKey) {
        return;
      }
      // We only want the promise to resolve or reject when the right storage
      // key is set, and not removed.
      //
      // NOTE: We make sure to remove the storage key in Main MySky before
      // setting it in there, because otherwise, setting an already-set key has
      // no effect.
      if (!newValue) {
        // Key was removed.
        return;
      }

      responseFn(resolve, reject, newValue);
    };

    // Set up a storage event listener.
    window.addEventListener("storage", handleEvent, {
      signal: abortController.signal,
    });
  });

  // Set up promise that rejects on timeout.
  const promise2 = new Promise<void>((_, reject) => setTimeout(reject, MYSKY_PORTAL_LOGIN_TIMEOUT));

  // Return when either promise finishes. Promise 1 returns when a response
  // either fails or succeeds. Promise 2 returns when the execution time
  // surpasses the timeout window.
  const response = (await Promise.race([promise1, promise2]).finally(() => {
    // Unregister the event listener.
    abortController.abort();
  })) as T;

  return response;
}

// =======
// Helpers
// =======

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
 * Stores the portal connect response containing the nickname in local storage.
 * This triggers the storage event listener in the main invisible MySky frame.
 * This registers or connects to a portal account and sets up login again when
 * the JWT cookie expires. See `handlePortalConnectResponseStorageKey`.
 *
 * @param response - The portal connect response with the user's nickname.
 */
function savePortalConnectResponseInStorage(response: PortalConnectResponse): void {
  log("Entered savePortalConnectResponseInStorage");

  if (!localStorage) {
    console.warn("WARNING: localStorage disabled, seed not stored");
    return;
  }

  // Clear the key, or if we set it to a value that's already set it will not
  // trigger the event listener.
  localStorage.removeItem(PORTAL_CONNECT_RESPONSE_STORAGE_KEY);

  // Set the nickname, triggering the storage event.
  localStorage.setItem(PORTAL_CONNECT_RESPONSE_STORAGE_KEY, JSON.stringify(response));
}

/**
 * Stores the root seed in local storage. This triggers the storage event
 * listener in the main invisible MySky frame. This switches to the preferred
 * portal, registers or logs in to the portal account and sets up login again
 * when the JWT cookie expires. See `handleSeedStorageKey`.
 *
 * NOTE: If ENV == 'dev' the seed is salted before storage.
 *
 * @param seed - The root seed.
 */
function saveSeedInStorage(seed: Uint8Array): void {
  log("Entered saveSeedInStorage");

  if (!localStorage) {
    console.warn("WARNING: localStorage disabled, seed not stored");
    return;
  }

  // If in dev mode, salt the seed.
  if (dev) {
    seed = saltSeedDevMode(seed);
  }

  // Clear the key, or if we set it to a value that's already set it will not
  // trigger the event listener.
  localStorage.removeItem(SEED_STORAGE_KEY);

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
  const hash = hashWithSalt(seed, "developer mode");
  return hash.slice(0, 16);
}
