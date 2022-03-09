import { SkynetClient } from "skynet-js";

import { randomAsciiString } from "../utils";
import { generatePhrase, phraseToSeed } from "../../src/seed";
import { login, logout, register, registerUserPubkey } from "../../src/portal_account";

const portalUrl = "https://skynetfree.net";
const client = new SkynetClient(portalUrl);

const phrase = generatePhrase();
const seed = phraseToSeed(phrase);
const email = `${randomAsciiString(20)}@bar.com`;
const tweak = randomAsciiString(20);
const newTweak = randomAsciiString(20);

describe("Integration tests for registration and login", () => {
  it("should register and login to a new user on the portal", async () => {
    await register(client, seed, email, tweak);
  });

  // The following tests should run after the user has been registered.

  it("should login to an existing user on the portal", async () => {
    // Log into the user that was registered above.
    await login(client, seed, tweak);
  });

  // TODO: Unskip this!
  it.skip("should register a new pubkey with a user on the portal", async () => {
    await registerUserPubkey(client, seed, newTweak);

    // Should be able to login with the new tweak.
    await login(client, seed, newTweak);
  });

  it("should logout of the user", async () => {
    await logout(client);
  });
});
