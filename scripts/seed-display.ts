import { ChildHandshake, Connection, WindowMessenger } from "post-me";

import { SeedProviderResponse } from "../src/provider";
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

let readyResponse: SeedProviderResponse | null = null;

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
  // Prevent making unnecessary request.
  event.preventDefault();

  const phraseValue = uiSigninPassphraseText.value;
  if (phraseValue === "") {
    return setErrorMessage("Passphrase cannot be empty");
  }

  const [valid, error, seed] = validatePhrase(phraseValue);
  if (!valid || !seed) {
    return setErrorMessage(error);
  }

  handleResponse({ seed, email: null, action: "signin" });
};

(window as any).signUp = (event: Event) => {
  // Prevent making unnecessary request.
  event.preventDefault();

  if (uiSeedConfirm.checked === false) return;

  const seed = phraseToSeed(uiSignupPassphraseText.value);
  const email = uiSignupEmailText.value;

  handleResponse({ seed, email, action: "signup" });
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
    getSeedProviderResponse,
  };
  parentConnection = await ChildHandshake(messenger, methods);
}

/**
 * Called by MySky UI. Checks for the ready seed and an optional email at an
 * interval.
 *
 * @returns - The full seed provider response.
 */
async function getSeedProviderResponse(): Promise<SeedProviderResponse> {
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
 * Handles the values selected by the user.
 *
 * @param response - The full seed provider response.
 */
function handleResponse(response: SeedProviderResponse): void {
  // Trigger `getSeedProviderResponse`.
  readyResponse = response;
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
