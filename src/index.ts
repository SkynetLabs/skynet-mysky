// TODO: Enable full eslint lints.

import { MySky } from "./mysky";

// ===============
// START EXECUTION
// ===============

// Launch MySky.
(async () => {
  console.log("Calling MySky.initialize");
  try {
    await MySky.initialize();
  } catch (err) {
    console.log(err);
  }
})().catch(err => {
  console.log(err);
})
