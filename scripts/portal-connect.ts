import { ChildHandshake, Connection, WindowMessenger } from "post-me";
import { ensureUrl } from "skynet-mysky-utils";

import { PORTAL_ACCOUNT_PAGE_SUBDOMAIN } from "../src/portal_account";
import { PortalConnectResponse } from "../src/provider";
import { log } from "../src/util";

const uiRegisterEmailText = <HTMLInputElement>document.getElementById("register-email-text")!;
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

(window as any).goToInitialPage = () => {
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

  handleResponse({ action: "notnow" });
};

(window as any).window.register = (event: Event) => {
  // Prevent making unnecessary request.
  event.preventDefault();

  if (uiRegisterEmailText.value === "" || uiRegisterNicknameText.value === "") return;

  const email = uiRegisterEmailText.value;
  const nickname = uiRegisterNicknameText.value;

  handleResponse({ email, nickname, action: "register" });
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
 * @param portalDomain - The domain of the portal we are connecting to.
 * @returns - The portal connect response, if set.
 */
async function getPortalConnectResponse(portalDomain: string): Promise<PortalConnectResponse> {
  log("Entered getPortalConnectResponse");

  // Encode the input to prevent HTML injection attacks.
  portalDomain = encodeURI(portalDomain);

  // Fill in values for the portal and account domains.
  const accountDomain = `${PORTAL_ACCOUNT_PAGE_SUBDOMAIN}.${portalDomain}`;
  const accountUrl = ensureUrl(accountDomain);
  let node: HTMLParagraphElement;
  node = <HTMLParagraphElement>document.getElementById("not-connected-notice")!;
  node.innerHTML = node.innerHTML!.replace("{portalDomain}", portalDomain);
  node = <HTMLParagraphElement>document.getElementById("signin-portal-notice")!;
  node.innerHTML = node.innerHTML!.replace("{portalDomain}", portalDomain);
  node = <HTMLParagraphElement>document.getElementById("register-portal-notice")!;
  node.innerHTML = node.innerHTML!.replace("{portalDomain}", portalDomain);
  const anchorNode = <HTMLAnchorElement>document.getElementById("signin-account-link")!;
  // Set href attribute.
  anchorNode.setAttribute("href", accountUrl);
  anchorNode.innerHTML = anchorNode.innerHTML!.replace("{accountDomain}", accountDomain);

  // Go to initial page.
  (window as any).goToInitialPage();

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
