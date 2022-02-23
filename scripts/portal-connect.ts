import { ChildHandshake, Connection, WindowMessenger } from "post-me";

import { PortalConnectResponse } from "../src/provider";
import { log } from "../src/util";

const uiRegisterNicknameText = <HTMLInputElement>document.getElementById("register-nickname-text")!;
const uiSigninConfirm = <HTMLInputElement>document.getElementById("signin-confirm")!;
const uiSigninNicknameText = <HTMLInputElement>document.getElementById("signin-nickname-text")!;

const uiInitialPage = document.getElementById("initial-page")!;
const uiRegisterPage = document.getElementById("register-page")!;
const uiSigninPage = document.getElementById("signin-page")!;

let readyResponse: PortalConnectResponse | null = null;

let parentConnection: Connection | null = null;

// ======
// Events
// ======

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

// Code that runs on page load.
window.onload = async () => {
  await init();
};

// ============
// User Actions
// ===========

(window as any).back = () => {
  setAllSeedContainersInvisible();
  uiInitialPage.style.removeProperty("display");
};

(window as any).goToRegister = () => {
  setAllSeedContainersInvisible();
  uiRegisterPage.style.removeProperty("display");
};

(window as any).goToSignIn = () => {
  setAllSeedContainersInvisible();
  uiSigninPage.style.removeProperty("display");
};

(window as any).notNow = (event: Event) => {
  // Prevent making unnecessary request.
  event.preventDefault();

  handleResponse({ nickname: null, action: "notnow" });
};

(window as any).window.register = (event: Event) => {
  // Prevent making unnecessary request.
  event.preventDefault();

  if (uiRegisterNicknameText.value === "") return;

  const nickname = uiRegisterNicknameText.value;

  handleResponse({ nickname, action: "register" });
};

(window as any).window.signIn = (event: Event) => {
  // Prevent making unnecessary request.
  event.preventDefault();

  if (uiSigninConfirm.checked === false || uiSigninNicknameText.value === "") return;

  const nickname = uiSigninNicknameText.value;

  handleResponse({ nickname, action: "signin" });
};

// ==========
// Core Logic
// ==========

/**
 * Initialize the communication with the UI.
 */
async function init(): Promise<void> {
  log("Entered init");

  // Establish handshake with parent window.

  const messenger = new WindowMessenger({
    localWindow: window,
    remoteWindow: window.parent,
    remoteOrigin: "*",
  });
  const methods = {
    getPortalConnectResponse,
  };
  parentConnection = await ChildHandshake(messenger, methods);
}

/**
 * Called by MySky UI. Checks for the ready response at an interval.
 *
 * @returns - The portal connect response, if set.
 */
async function getPortalConnectResponse(): Promise<PortalConnectResponse> {
  log("Entered getPortalConnectResponse");

  const checkInterval = 100;

  return new Promise((resolve) => {
    const checkFunc = () => {
      if (readyResponse) {
        resolve(readyResponse);
      }
    };

    window.setInterval(checkFunc, checkInterval);
  });
}

/**
 * Handles the response selected by the user and the user action.
 *
 * @param response - The response.
 */
function handleResponse(response: PortalConnectResponse): void {
  // Set `readyResponse`, triggering `getResponse`.
  readyResponse = response;
}

// ================
// Helper Functions
// ================

/**
 * Sets all the div containers to be invisible.
 */
function setAllSeedContainersInvisible(): void {
  uiInitialPage.style.display = "none";
  uiSigninPage.style.display = "none";
  uiRegisterPage.style.display = "none";
}
