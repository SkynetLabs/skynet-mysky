import Mustache from "mustache";
import { domainToASCII } from "url";
import remove from "confusables";
import { ChildHandshake, Connection, WindowMessenger } from "post-me";
import { CheckPermissionsResponse, permCategoryToString, Permission, permTypeToString } from "skynet-mysky-utils";

const uiPermissionsConfusables = document.getElementById("permissions-confusables")!;
const uiPermissionsConfusablesText = document.getElementById("permissions-confusables-text")!;
const uiRequesterDomain = document.getElementById("requester-domain")!;
const uiPermissionsSelection = document.getElementById("permissions-selection")!;
const uiPermissionsForm = document.getElementById("permissions-form")!;

let requestedPermissions: Permission[] | null = null;
let readyPermissionsResponse: CheckPermissionsResponse | null = null;
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
};

// ============
// User Actions
// ============

uiPermissionsForm.addEventListener("submit", (event: Event) => {
  event.preventDefault();

  if (!requestedPermissions) {
    throw new Error("requestedPermissions object not set");
  }

  // Set permissions response as ready.

  const grantedPermissions = [];
  const failedPermissions = [];
  const checkboxes = document.getElementsByName("permissions-checkbox");

  for (let i = 0, n = checkboxes.length; i < n; i++) {
    const element = <HTMLInputElement>checkboxes[i];
    const perm = requestedPermissions[parseInt(element.value)];
    if (element.checked) {
      grantedPermissions.push(perm);
    } else {
      failedPermissions.push(perm);
    }
  }

  readyPermissionsResponse = { grantedPermissions, failedPermissions };
});

uiPermissionsSelection.addEventListener("change", (event: Event) => {
  const target = event.target as HTMLInputElement;

  if (target.name === "permissions-checkbox") {
    const checkboxes = Array.from(document.getElementsByName("permissions-checkbox")) as [HTMLInputElement];
    const selectAll = document.getElementById("toggle-permissions") as HTMLInputElement;

    selectAll.checked = checkboxes.every(({ checked }) => checked);
  }
});

(window as any).toggleSelected = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const checked = target.checked;

  const checkboxes = document.getElementsByName("permissions-checkbox");
  for (let i = 0, n = checkboxes.length; i < n; i++) {
    (<HTMLInputElement>checkboxes[i]).checked = checked;
  }
};

// ==========
// Core Logic
// ==========

/**
 * Initialize the communication with the UI.
 */
async function init() {
  setAllPermissionsContainersInvisible();

  // Establish handshake with parent window.

  const messenger = new WindowMessenger({
    localWindow: window,
    remoteWindow: window.parent,
    remoteOrigin: "*",
  });
  const methods = {
    getPermissions,
  };
  parentConnection = await ChildHandshake(messenger, methods);
}

/**
 * Called by MySky UI. Checks for the ready permissions at an interval.
 *
 * @param pendingPermissions - The list of pending permissions.
 * @param referrer - The referrer URL.
 * @returns - The list of granted permissions and the list of rejected permissions.
 */
async function getPermissions(pendingPermissions: Permission[], referrer: string): Promise<CheckPermissionsResponse> {
  // Initialize the permissions checkboxes.

  requestedPermissions = pendingPermissions;

  const permissions = requestedPermissions
    .slice()
    .reverse()
    .map((permission, index) => {
      const category = permCategoryToString(permission.category);
      const type = permTypeToString(permission.permType);

      return {
        value: index,
        name: `${type} ${category}`,
        description: `Allow this app to ${type} ${category} files at ${permission.path}`,
      };
    });
  const template = document.getElementById("permissions-template")!.innerHTML;
  const rendered = Mustache.render(template, { permissions });
  document.getElementById("permissions-selection")!.innerHTML = rendered;

  // Set custom messages.

  const referrerUrl = new URL(referrer);
  referrer = referrerUrl.hostname;
  setMessages(referrer);

  // Check for ready permissions response.

  const checkInterval = 100;

  return new Promise((resolve) => {
    const checkFunc = () => {
      if (readyPermissionsResponse !== null) {
        resolve(readyPermissionsResponse);
      }
    };

    window.setInterval(checkFunc, checkInterval);
  });
}

// ================
// Helper Functions
// ================

/**
 * Sets all permissions divs to be invisible.
 */
function setAllPermissionsContainersInvisible(): void {
  uiPermissionsConfusables.classList.add("hidden");
}

/**
 * Sets the messages for the referrer, including a potential warning about a
 * confusable domain.
 *
 * @param referrerDomain - The referrer domain.
 */
function setMessages(referrerDomain: string): void {
  const referrerUnicode = domainToASCII(referrerDomain);
  let fullReferrerString: string;
  if (referrerUnicode !== referrerDomain) {
    fullReferrerString = `'${referrerUnicode}' ('${referrerDomain}')`;
  } else {
    fullReferrerString = `'${referrerDomain}'`;
  }

  // Set the referrer domain message.
  uiRequesterDomain.textContent = fullReferrerString;

  // Handle potentially-confusable domains.
  const unconfusedReferrer = remove(referrerUnicode);
  if (unconfusedReferrer !== referrerUnicode) {
    uiPermissionsConfusablesText.textContent = uiPermissionsConfusables
      .textContent!.replace("'A'", `${fullReferrerString}`)
      .replace("'B'", `'${unconfusedReferrer}'`);
    uiPermissionsConfusables.classList.remove("hidden");
  }
}
