// TODO: Enable full eslint lints.

import { MySky } from "./mysky";
import { log } from "./util";

// ===============
// START EXECUTION
// ===============

// Launch MySky.
(async () => {
  log("Calling MySky.initialize");
  try {
    await MySky.initialize();
  } catch (err) {
    console.log(err);
  }
})().catch(err => {
  console.log(err);
})
