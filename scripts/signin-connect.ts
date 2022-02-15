import { ChildHandshake, Connection, WindowMessenger } from "post-me";

import { log } from "../src/util";

const uiConnectEmailText = <HTMLInputElement>document.getElementById("connect-email-text")!;

let readyEmail: string | null = null;

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
// ============

(window as any).connect = () => {
  const email = uiConnectEmailText.value;

  handleEmail(email);
};

(window as any).continue = () => {
  handleEmail("");
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
    getEmail,
  };
  parentConnection = await ChildHandshake(messenger, methods);
}

/**
 * Called by MySky UI. Checks for the email at an interval.
 *
 * @returns - The email, if set.
 */
async function getEmail(): Promise<string | null> {
  log("Entered getEmail");

  const checkInterval = 100;

  return new Promise((resolve) => {
    const checkFunc = () => {
      if (readyEmail !== null) {
        resolve(readyEmail);
      }
    };

    window.setInterval(checkFunc, checkInterval);
  });
}

/**
 * Handles the email selected by the user.
 *
 * @param email - The email.
 */
function handleEmail(email: string): void {
  // Set `readyEmail`, triggering `getEmail`.
  readyEmail = email;
}
