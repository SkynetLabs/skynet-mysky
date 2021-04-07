import { ChildHandshake, Connection, WindowMessenger } from "post-me";
import { SkynetClient } from "skynet-js";

const uiSeedLoggedOut = document.getElementById("seed-logged-out")!;
const uiSeedSignIn = document.getElementById("seed-sign-in")!;
const uiSeedSignUp = document.getElementById("seed-sign-up")!;

let readySeed = "";
let parentConnection: Connection | null = null;

// ======
// Events
// ======

window.onerror = async function (error: any) {
  console.log(error);
  if (parentConnection) {
    if (typeof error === "string") {
      await parentConnection.remoteHandle().call("catchError", error);
    } else {
      await parentConnection.remoteHandle().call("catchError", error.type);
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

(window as any).signIn = () => {
  const seedValue = (<HTMLInputElement>document.getElementById("signin-passphrase-text")).value;

  handleSeed(seedValue);
};

(window as any).signUp = () => {
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
