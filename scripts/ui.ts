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

import { hashWithSalt } from "../src/crypto";
import { checkStoredSeed, EMAIL_STORAGE_KEY, PORTAL_LOGIN_COMPLETE_SENTINEL_KEY, SEED_STORAGE_KEY } from "../src/mysky";
import {
  getPermissionsProviderUrl,
  relativePermissionsDisplayUrl,
  defaultSeedDisplayProvider,
  launchPermissionsProvider,
  SeedProviderAction,
  SeedProviderResponse,
} from "../src/provider";
import { log } from "../src/util";

const RELATIVE_SEED_SELECTION_DISPLAY_URL = "seed-selection.html";
const RELATIVE_SIGNIN_CONNECT_DISPLAY_URL = "signin-connect.html";

const MYSKY_PORTAL_LOGIN_TIMEOUT = 30000;

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
  await checkBrowserSupported();

  // Get the seed and email.
  const [seed, email] = await getSeedAndEmail();

  // Save the seed and email in local storage.
  saveSeedAndEmail(seed, email);

  // Wait for Main MySky to login successfully.
  await resolveOnMySkyPortalLogin();

  // Pass in any request permissions and get a permissions response.
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
 * Gets the seed and email. The flow is:
 *
 * 1. Check for the seed in local storage.
 *
 * 2. If the seed is not found, get it and maybe the email from a seed provider.
 *
 * 3. If we did not open the provider, or it did not provide the email, then
 * check for an email in the saved user settings.
 *
 * 4. If we still didn't get an email, and the seed provider action was signin,
 * then we display the signin-connect page where the user may connect his email
 * on signin.
 *
 * (5. We return the seed and email and save them in storage in another
 * function, which triggers Main MySky's storage listener.)
 *
 * @returns - The seed and email.
 */
async function getSeedAndEmail(): Promise<[Uint8Array, string | null]> {
  let seed = checkStoredSeed();
  let email: string | null = null;
  let action: SeedProviderAction | null = null;
  let emailProvidedByUser = null;

  // If we don't have a seed, get it from the seed provider. We may also get
  // the email if the user is signing up for the first time.
  if (!seed) {
    const resp = await getSeedAndEmailFromProvider();
    [seed, email, action] = [resp.seed, resp.email, resp.action];
    emailProvidedByUser = email !== null;
  }

  if (action === "signin") {
    // Assert that we did not get an email from the signin page. (This would
    // indicate a developer error in the flow -- we only expect an email from
    // signup.)
    if (emailProvidedByUser) {
      throw new Error("Assertion failed: Got email from signin page (developer error)");
    }

    // We're signing in, try to get the email from saved settings.
    let savedEmailFound = false;
    if (!email) {
      email = await getEmailFromSettings();
      savedEmailFound = email !== null;
    }

    // If the user signed in above and we don't have an email, open the signin
    // connect display.
    if (!savedEmailFound) {
      email = await runSigninConnectDisplay();

      // Update `emailProvided` if we got the email.
      //
      // If the email is provided we save it later, once registration/login has
      // succeeded.
      emailProvidedByUser = email !== null;
    }
  }

  return [seed, email];
}

/**
 * Tries to get a seed and email from a seed provider.
 *
 * @returns - The full seed provider response.
 */
async function getSeedAndEmailFromProvider(): Promise<SeedProviderResponse> {
  // Show seed provider chooser.
  const seedProviderDisplayUrl = await getSeedProviderDisplayUrl();

  // User has chosen seed provider, open seed provider display.
  log("Calling runSeedProviderDisplay");
  return await runSeedProviderDisplay(seedProviderDisplayUrl);
}

// TODO
/**
 * Tries to get the email from the saved user settings.
 *
 * @returns - The email if found.
 */
async function getEmailFromSettings(): Promise<string | null> {
  return null;
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
async function getSigninConnectDisplayUrl(): Promise<string> {
  return `${window.location.hostname}/${RELATIVE_SIGNIN_CONNECT_DISPLAY_URL}`;
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

  return setupAndRunDisplay(permissionsProviderDisplayUrl, "getPermissions", pendingPermissions, document.referrer);
}

/**
 * Runs the seed provider display and returns with the user seed.
 *
 * @param seedProviderDisplayUrl - The seed provider display URL.
 * @returns - The user seed as bytes and the email.
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

  const seedSelectionDisplayUrl = `${window.location.hostname}/${RELATIVE_SEED_SELECTION_DISPLAY_URL}`;

  return setupAndRunDisplay(seedSelectionDisplayUrl, "getSeedProvider");
}

/**
 * Runs the signin connect display and returns with the email, if provided.
 *
 * @returns - The seed provider.
 */
async function runSigninConnectDisplay(): Promise<string | null> {
  const signinConnectDisplayUrl = await getSigninConnectDisplayUrl();

  return setupAndRunDisplay(signinConnectDisplayUrl, "getEmail");
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

      // TODO: This should be a dual-promise that also calls ping() on an interval and rejects if no response was found in a given amount of time.
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
 * Resolves when portal login on Main MySky completes.
 *
 * @returns - An empty promise.
 */
async function resolveOnMySkyPortalLogin(): Promise<void> {
  return Promise.race([
    new Promise<void>((resolve, reject) =>
      window.addEventListener("storage", async ({ key, newValue }: StorageEvent) => {
        if (key !== PORTAL_LOGIN_COMPLETE_SENTINEL_KEY) {
          return;
        }

        // Check for errors from Main MySky.
        if (newValue !== "") {
          reject(newValue);
        }

        resolve();
      })
    ),
    new Promise<void>((_, reject) => setTimeout(reject, MYSKY_PORTAL_LOGIN_TIMEOUT)),
  ]);
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
 * Stores the root seed and email in local storage. This triggers the storage
 * event listener in the main invisible MySky frame. This switches to the
 * preferred portal, registers or logs in to the portal account and sets up
 * login again when the JWT cookie expires. See `setUpStorageEventListener`.
 *
 * NOTE: If ENV == 'dev' the seed is salted before storage.
 *
 * @param seed - The root seed.
 * @param email - The email.
 */
export function saveSeedAndEmail(seed: Uint8Array, email: string | null): void {
  log("Called saveSeedAndEmail");
  if (!localStorage) {
    console.log("WARNING: localStorage disabled, seed not stored");
    return;
  }

  // If in dev mode, salt the seed.
  if (dev) {
    seed = saltSeedDevMode(seed);
  }

  // Set the email first.
  if (email) {
    localStorage.setItem(EMAIL_STORAGE_KEY, email);
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
  const hash = hashWithSalt(seed, "developer mode");
  return hash.slice(0, 16);
}
