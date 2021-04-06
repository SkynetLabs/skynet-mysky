import { ChildHandshake, Connection, WindowMessenger } from "post-me";
import { SkynetClient } from "skynet-js";
import { errorWindowClosed } from "skynet-interface-utils";

const uiSeedLoggedOut = document.getElementById("seed-logged-out")!;
const uiSeedSignIn = document.getElementById("seed-sign-in")!;
const uiSeedSignUp = document.getElementById("seed-sign-up")!;

let readySeed = "";
let submitted = false;
let parentConnection: Connection | null = null;

// ======
// Events
// ======

// Event that is triggered when the window is closed.
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
  if (parentConnection) {
    if (typeof error === "string") {
      parentConnection.remoteHandle().call("catchError", error);
    } else {
      parentConnection.remoteHandle().call("catchError", error.type);
    }
  }
};

// Code that runs on page load.
window.onload = async () => {
  await init();

  // Go to Logged Out page.

  (window as any).goToLoggedOut();
};

// ============
// User Actions
// ============

(window as any).goToLoggedOut = () => {
  setAllSeedContainersInvisible();
  uiSeedLoggedOut.style.display = "block";
};

(window as any).goToSignIn = () => {
  setAllSeedContainersInvisible();
  uiSeedSignIn.style.display = "block";
};

(window as any).goToSignUp = () => {
  setAllSeedContainersInvisible();
  uiSeedSignUp.style.display = "block";
};

(window as any).signIn = async () => {
  const seedValue = (<HTMLInputElement>document.getElementById("signin-passphrase-text")).value;

  handleSeed(seedValue);
};

(window as any).signUp = async () => {
  const seedValue = (<HTMLInputElement>document.getElementById("signup-passphrase-text")).value;

  handleSeed(seedValue);
};

// ==========
// Core Logic
// ==========

async function init() {
  // Establish handshake with parent skapp.

  const messenger = new WindowMessenger({
    localWindow: window,
    remoteWindow: window.parent,
    remoteOrigin: "*",
  });
  const methods = {
    getRootSeed,
  };
  parentConnection = await ChildHandshake(messenger, methods);
}

/**
 * Checks for the ready seed at an interval.
 */
async function getRootSeed(): Promise<string> {
  const checkInterval = 100;

  return new Promise((resolve) => {
    const checkFunc = () => {
      if (readySeed !== "") {
        resolve(readySeed);
      }
    };

    window.setInterval(checkFunc, checkInterval);
  });
}

function handleSeed(seed: string) {
  readySeed = seed;
}

// ================
// Helper Functions
// ================

/**
 *
 */
export function activateUI() {
  document.getElementById("darkLayer")!.style.display = "none";
}

/**
 *
 */
export function deactivateUI() {
  document.getElementById("darkLayer")!.style.display = "";
}

/**
 *
 */
function setAllSeedContainersInvisible() {
  uiSeedLoggedOut.style.display = "none";
  uiSeedSignIn.style.display = "none";
  uiSeedSignUp.style.display = "none";
}
