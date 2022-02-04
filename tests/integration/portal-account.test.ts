import { DEFAULT_SKYNET_PORTAL_URL, SkynetClient } from "skynet-js";

import { randomAsciiString } from "../utils";
import { generatePhrase, phraseToSeed } from "../../src/seed";
import { login, register } from "../../src/portal-account";

// const portalUrl = DEFAULT_SKYNET_PORTAL_URL;
const portalUrl = "https://siasky.xyz";
const client = new SkynetClient(portalUrl);
const phrase = generatePhrase();
const seed = phraseToSeed(phrase);
const email = `${randomAsciiString(20)}@bar.com`;

describe("Integration tests for registration and login", () => {
  it("should register a new user on the portal", async () => {
    await register(client, seed, email);
  });

  it("should login to an existing user on the portal", async () => {
    // Log into the user that was registered above.
    await login(client, seed, email);
  });
});
