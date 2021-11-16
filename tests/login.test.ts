import { SkynetClient } from "skynet-js";

import { phraseToSeed } from "../src/seed";
import { register } from "../src/login";

const client = new SkynetClient();
const phrase = "topic gambit bumper lyrics etched dime going mocked abbey scrub irate depth absorb bias awful";
const seed = phraseToSeed(phrase);

describe("Registration tests", () => {
  const email = "foo@bar.com";

  it("should register a new user", async () => {
    await register(client, seed, email);
  });
});
