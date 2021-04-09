const urlParams = new URLSearchParams(window.location.search);
const DEBUG_ENABLED = urlParams.get('debug') === "true";

// log prints to stdout only if DEBUG_ENABLED flag is set
export function log(message: string, ...optionalContext: any[]) {
  if (DEBUG_ENABLED) {
    console.log(message, ...optionalContext)
  }
}
