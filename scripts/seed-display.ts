import { ChildHandshake, Connection, WindowMessenger } from "post-me";
import { generatePhrase, phraseToSeed, validatePhrase } from "../src/seed";

const uiErrorMessage = document.getElementById("error-message")!;
const uiErrorMessageText = document.getElementById("error-message-text")!;
const uiSeedConfirm = <HTMLInputElement>document.getElementById("seed-confirm")!;
const uiSigninPage = document.getElementById("signin-page")!;
const uiSigninPassphraseText = <HTMLInputElement>document.getElementById("signin-passphrase-text")!;
const uiSignupEmailText = <HTMLInputElement>document.getElementById("signup-email-text")!;
const uiSignupPage = document.getElementById("signup-page")!;
const uiSignupPassphraseText = <HTMLInputElement>document.getElementById("signup-passphrase-text")!;

const setErrorMessage = (message: string) => {
  if (message) {
    uiErrorMessageText.textContent = message;
    uiErrorMessage.classList.remove("hidden");
  } else {
    uiErrorMessage.classList.add("hidden");
  }
};

let readySeed: Uint8Array | null = null;
let readyEmail: string | null = null;

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
  uiSigninPage.style.removeProperty("display");
};

(window as any).goToSignUp = () => {
  // Hide all containers.
  setAllSeedContainersInvisible();

  // Generate the phrase.
  const generatedPhrase = generatePhrase();
  uiSignupPassphraseText.value = generatedPhrase;

  // Show sign up container.
  uiSignupPage.style.removeProperty("display");
};

(window as any).signIn = (event: Event) => {
  event.preventDefault();

  const phraseValue = uiSigninPassphraseText.value;
  if (phraseValue === "") {
    return setErrorMessage("Passphrase cannot be empty");
  }

  const [valid, error, seed] = validatePhrase(phraseValue);
  if (!valid || !seed) {
    return setErrorMessage(error);
  }

  handleSeedAndEmail(seed, null);
};

(window as any).signUp = () => {
  if (uiSeedConfirm.checked === false) return;

  const seed = phraseToSeed(uiSignupPassphraseText.value);
  const email = uiSignupEmailText.value;

  handleSeedAndEmail(seed, email);
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
    getRootSeedAndEmail,
  };
  parentConnection = await ChildHandshake(messenger, methods);
}

/**
 * Called by MySky UI. Checks for the ready seed at an interval.
 *
 * @returns - The user seed as bytes.
 */
async function getRootSeedAndEmail(): Promise<[Uint8Array, string | null]> {
  const checkInterval = 100;

  return new Promise((resolve) => {
    const checkFunc = () => {
      if (readySeed) {
        resolve([readySeed, readyEmail]);
      }
    };

    window.setInterval(checkFunc, checkInterval);
  });
}

/**
 * Handles the seed and email selected by the user.
 *
 * @param seed - The seed.
 * @param email - The email.
 */
function handleSeedAndEmail(seed: Uint8Array, email: string | null): void {
  readyEmail = email;
  // Set `readySeed`, triggering `getRootSeedAndEmail`.
  readySeed = seed;
}

// ================
// Helper Functions
// ================

/**
 * Sets all the div containers to be invisible.
 */
function setAllSeedContainersInvisible(): void {
  uiSigninPage.style.display = "none";
  uiSignupPage.style.display = "none";
}
