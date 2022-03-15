import { MainMySky } from "./mysky";
import { log } from "./util";

// ===============
// START EXECUTION
// ===============

// Launch MySky.
(async () => {
  log("Calling MySky.initialize");
  try {
    await MainMySky.initialize();
  } catch (err) {
    console.warn(err);
  }
})().catch((err) => {
  console.warn(err);
});
