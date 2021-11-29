import { SkynetClient } from "skynet-js";

import { randomUnicodeString } from "../utils";
import { generatePhrase, phraseToSeed } from "../../src/seed";
import { login, register } from "../../src/login";

// TODO: Remove hard-coded URL.
const portalUrl = "https://siasky.xyz";
const client = new SkynetClient(portalUrl);
const phrase = generatePhrase();
const seed = phraseToSeed(phrase);
const email = `${randomUnicodeString(20)}@bar.com`;

describe("Integration tests for registration and login", () => {
  it("should register a new user", async () => {
    const jwt = await register(client, seed, email);

    // TODO: assert expected size of jwt.
    expect(jwt).not.toEqual("");
    // console.log(jwt);
  });

  it("should login to an existing user", async () => {
    // Log into the user that was registered above.
    const jwt = await login(client, seed, email);

    // TODO: assert expected size of jwt.
    expect(jwt).not.toEqual("");
  });
});
