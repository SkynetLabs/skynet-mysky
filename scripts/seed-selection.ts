import { ChildHandshake, Connection, WindowMessenger } from "post-me";
import { SkynetClient } from "skynet-js";

const uiSeedSelectionSubmit = document.getElementById("seed-selection-submit")!;

let readySeedProvider = "";
let parentConnection: Connection | null = null;

// ======
// Events
// ======

window.onerror = function (error: any) {
  console.log(error);
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
};

// ============
// User Actions
// ============

(window as any).submit = () => {
  // Get the value of the form.

  const radios = document.getElementsByName("seed-selection-radio-input");

  let seedProvider = "";
  for (let i = 0, length = radios.length; i < length; i++) {
    const radio = <HTMLInputElement>radios[i];
    if (radio.checked) {
      seedProvider = radio.value;

      // Only one radio can be logically selected, don't check the rest.
      break;
    }
  }

  readySeedProvider = seedProvider;
};

// ==========
// Core Logic
// ==========

/**
 * Initialize the communication with the UI.
 */
async function init() {
  // Establish handshake with parent window.

  const messenger = new WindowMessenger({
    localWindow: window,
    remoteWindow: window.parent,
    remoteOrigin: "*",
  });
  const methods = {
    getSeedProvider,
  };
  parentConnection = await ChildHandshake(messenger, methods);
}

/**
 * Called by MySky UI. Checks for the ready seed provider at an interval.
 */
async function getSeedProvider(): Promise<string> {
  const checkInterval = 100;

  return new Promise((resolve) => {
    const checkFunc = () => {
      if (readySeedProvider !== "") {
        resolve(readySeedProvider);
      }
    };

    window.setInterval(checkFunc, checkInterval);
  });
}
