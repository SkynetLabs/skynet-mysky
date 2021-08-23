// eslint-disable-next-line @typescript-eslint/no-var-requires
const punycode = require("punycode/");

import remove from "confusables";
import { ChildHandshake, Connection, WindowMessenger } from "post-me";
import { CheckPermissionsResponse, permCategoryToString, Permission, permTypeToString } from "skynet-mysky-utils";

const uiPermissionsButtons = document.getElementById("permissions-buttons")!;
const uiPermissionsCheckboxes = document.getElementById("permissions-checkboxes")!;
const uiPermissionsConfusables = document.getElementById("permissions-confusables")!;
const uiPermissionsDomain = document.getElementById("permissions-domain")!;

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

(window as any).checkAll = () => {
  const checkboxes = document.getElementsByName("permissions-checkbox");
  for (let i = 0, n = checkboxes.length; i < n; i++) {
    (<HTMLInputElement>checkboxes[i]).checked = true;
  }
};

(window as any).uncheckAll = () => {
  const checkboxes = document.getElementsByName("permissions-checkbox");
  for (let i = 0, n = checkboxes.length; i < n; i++) {
    (<HTMLInputElement>checkboxes[i]).checked = false;
  }
};

(window as any).submit = () => {
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

  // Add the permissions in reverse order since we prepend to the container each time.
  let i = 0;
  for (const perm of requestedPermissions.reverse()) {
    const readablePerm = readablePermission(perm);
    const checkboxHtml = `
<input type="checkbox" name="permissions-checkbox" value="${i}"/>${readablePerm}<br/>
`;

    const checkboxDiv = document.createElement("div")!;
    checkboxDiv.classList.add("checkbox-element");
    checkboxDiv.innerHTML = checkboxHtml;

    // Add div to container.
    uiPermissionsCheckboxes.prepend(checkboxDiv);
    i++;
  }

  // Set custom messages.

  const referrerUrl = new URL(referrer);
  referrer = referrerUrl.hostname;
  setMessages(referrer);

  // Display the page.

  setAllPermissionsContainersVisible();

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
 * Constructs a human-readable HTML version of the permission.
 *
 * @param perm - The given permission.
 * @returns - The HTML string.
 */
function readablePermission(perm: Permission): string {
  const category = permCategoryToString(perm.category);
  const permType = permTypeToString(perm.permType);

  return `<b>${perm.requestor}</b> can <b>${permType}</b> <b>${category}</b> files at <b>${perm.path}</b>`;
}

/**
 * Sets all permissions divs to be invisible.
 */
function setAllPermissionsContainersInvisible(): void {
  uiPermissionsButtons.style.display = "none";
  uiPermissionsConfusables.style.display = "none";
  uiPermissionsCheckboxes.style.display = "none";
  uiPermissionsDomain.style.display = "none";
}

/**
 * Sets all permissions divs to be visible.
 */
function setAllPermissionsContainersVisible(): void {
  uiPermissionsButtons.style.display = "block";
  uiPermissionsCheckboxes.style.display = "block";
  uiPermissionsDomain.style.display = "block";
}

/**
 * Sets the messages for the referrer, including a potential warning about a
 * confusable domain.
 *
 * @param referrerDomain - The referrer domain.
 */
function setMessages(referrerDomain: string): void {
  const referrerUnicode = punycode.toUnicode(referrerDomain);
  let fullReferrerString: string;
  if (referrerUnicode !== referrerDomain) {
    fullReferrerString = `'${referrerUnicode}' ('${referrerDomain}')`;
  } else {
    fullReferrerString = `'${referrerDomain}'`;
  }

  // Set the referrer domain message.
  uiPermissionsDomain.textContent = uiPermissionsDomain.textContent!.replace("'X'", `${fullReferrerString}`);

  // Handle potentially-confusable domains.
  const unconfusedReferrer = remove(referrerUnicode);
  if (unconfusedReferrer !== referrerUnicode) {
    uiPermissionsConfusables.textContent = uiPermissionsConfusables
      .textContent!.replace("'A'", `'${referrerUnicode}'`)
      .replace("'B'", `'${unconfusedReferrer}'`);
    uiPermissionsConfusables.style.display = "block";
  }
}
