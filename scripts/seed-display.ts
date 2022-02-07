import { ChildHandshake, Connection, WindowMessenger } from "post-me";
import { generatePhrase, phraseToSeed, validatePhrase } from "../src/seed";

const uiSeedSignIn = document.getElementById("seed-sign-in")!;
const uiSeedSignUp = document.getElementById("seed-sign-up")!;
const uiErrorMessage = document.getElementById("error-message")!;
const uiErrorMessageText = document.getElementById("error-message-text")!;

const setErrorMessage = (message: string) => {
  if (message) {
    uiErrorMessageText.textContent = message;
    uiErrorMessage.classList.remove("hidden");
  } else {
    uiErrorMessage.classList.add("hidden");
  }
};

let readySeed: Uint8Array | null = null;
let parentConnection: Connection | null = null;

// ======
// Events
// ======

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

// Code that runs on page load.
window.onload = async () => {
  await init();

  // Go to Logged Out page.

  (window as any).goToSignIn();
};

// ============
// User Actions
// ============

(window as any).goToSignIn = () => {
  setAllSeedContainersInvisible();
  uiSeedSignIn.style.removeProperty("display");
};

(window as any).goToSignUp = () => {
  setAllSeedContainersInvisible();

  const generatedPhrase = generatePhrase();
  (<HTMLInputElement>document.getElementById("signup-passphrase-text")).value = generatedPhrase;

  uiSeedSignUp.style.removeProperty("display");
};

(window as any).signIn = (event: Event) => {
  // Prevent making unnecessary request.
  event.preventDefault();

  const phraseValue = (<HTMLInputElement>document.getElementById("signin-passphrase-text")).value;

  if (phraseValue === "") {
    return setErrorMessage("Passphrase cannot be empty");
  }

  const [valid, error, seed] = validatePhrase(phraseValue);

  if (!valid || !seed) {
    return setErrorMessage(error);
  }

  handleSeed(seed);
};

(window as any).signUp = (event: Event) => {
  // Prevent making unnecessary request.
  event.preventDefault();

  if ((<HTMLInputElement>document.getElementById("seed-confirm")).checked === false) return;

  const phraseValue = (<HTMLInputElement>document.getElementById("signup-passphrase-text")).value;

  handleSeed(phraseToSeed(phraseValue));
};

// ==========
// Core Logic
// ==========

/**
 * Initialize the communication with the UI.
 */
async function init(): Promise<void> {
  // Establish handshake with parent window.

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
 * Called by MySky UI. Checks for the ready seed at an interval.
 *
 * @returns - The user seed as bytes.
 */
async function getRootSeed(): Promise<Uint8Array> {
  const checkInterval = 100;

  return new Promise((resolve) => {
    const checkFunc = () => {
      if (readySeed !== null) {
        resolve(readySeed);
      }
    };

    window.setInterval(checkFunc, checkInterval);
  });
}

/**
 * Handles the seed selected by the user.
 *
 * @param seed - The seed to handle.
 */
function handleSeed(seed: Uint8Array): void {
  readySeed = seed;
}

// ================
// Helper Functions
// ================

/**
 * Sets all the div containers to be invisible.
 */
function setAllSeedContainersInvisible(): void {
  uiSeedSignIn.style.display = "none";
  uiSeedSignUp.style.display = "none";
}
