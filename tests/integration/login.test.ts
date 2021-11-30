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

    expect(jwt).not.toEqual("");
    // We don't know the exact length.
    expect(jwt.length).toBeGreaterThan(1000);
  });

  it("should login to an existing user", async () => {
    // Log into the user that was registered above.
    const jwt = await login(client, seed, email);

    expect(jwt).not.toEqual("");
    // We don't know the exact length.
    expect(jwt.length).toBeGreaterThan(1000);
  });
});
