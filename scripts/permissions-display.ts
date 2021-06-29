import { ChildHandshake, Connection, WindowMessenger } from "post-me";
import { CheckPermissionsResponse, permCategoryToString, Permission, permTypeToString } from "skynet-mysky-utils";

const uiPermissionsCheckboxes = document.getElementById("permissions-checkboxes")!;

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
 */
async function getPermissions(pendingPermissions: Permission[]): Promise<CheckPermissionsResponse> {
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

  // Display the page.

  uiPermissionsCheckboxes.style.display = "block";

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
 *
 */
function setAllPermissionsContainersInvisible() {
  uiPermissionsCheckboxes.style.display = "none";
}
