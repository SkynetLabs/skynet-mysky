import { SkynetClient } from "skynet-js";

import { randomAsciiString } from "../utils";
import { generatePhrase, phraseToSeed } from "../../src/seed";
import { getEmailFromJWT, login, register } from "../../src/portal-account";

// TODO: Remove hard-coded URL.
const portalUrl = "https://siasky.xyz";
const client = new SkynetClient(portalUrl);
const phrase = generatePhrase();
const seed = phraseToSeed(phrase);
const email = `${randomAsciiString(20)}@bar.com`;

describe("Integration tests for registration and login", () => {
  it("should register a new user on the portal", async () => {
    const jwt = await register(client, seed, email);

    expect(jwt).not.toEqual("");
    expect(getEmailFromJWT(jwt)).toEqual(email);
  });

  it("should login to an existing user on the portal", async () => {
    // Log into the user that was registered above.
    const jwt = await login(client, seed, email);

    expect(jwt).not.toEqual("");
    expect(getEmailFromJWT(jwt)).toEqual(email);
  });
});
