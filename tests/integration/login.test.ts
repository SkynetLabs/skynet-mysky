import { SkynetClient } from "skynet-js";

import { phraseToSeed } from "../../src/seed";
import { register } from "../../src/login";

// TODO: Remove hard-coded URL.
const client = new SkynetClient("https://dev3.siasky.dev");
const phrase = "topic gambit bumper lyrics etched dime going mocked abbey scrub irate depth absorb bias awful";
const seed = phraseToSeed(phrase);

describe("Registration tests", () => {
  const email = "foo@bar.com";

  it("should register a new user", async () => {
    await register(client, seed, email);
  });
});
