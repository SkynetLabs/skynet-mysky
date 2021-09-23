/**
 * Example usage:
 * ts-node ./utilities/recover-phrase-from-seed.ts "[240, 156, 64,  52, 23, 219, 229,  35, 54, 134, 90,  35, 116,  25, 77,  55]"
 */

import { seedToPhrase } from "../src/seed";

// Transform every file passed in to the script.
process.argv.forEach(function (arg, index) {
  if (index < 2) {
    return;
  }
  console.log(seedToPhrase(JSON.parse(arg)));
});
