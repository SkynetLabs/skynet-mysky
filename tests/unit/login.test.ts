import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { DEFAULT_SKYNET_PORTAL_URL, SkynetClient } from "skynet-js";

import { phraseToSeed } from "../../src/seed";
import { register } from "../../src/login";

let mock: MockAdapter;

const portalUrl = DEFAULT_SKYNET_PORTAL_URL;
const client = new SkynetClient(portalUrl);
const phrase = "topic gambit bumper lyrics etched dime going mocked abbey scrub irate depth absorb bias awful";
const seed = phraseToSeed(phrase);

const baseUrl = "https://account.siasky.net/api";
const registerRequestUrl = `${baseUrl}/register/request`;
const registerUrl = `${baseUrl}/register`;
const loginRequestUrl = `${baseUrl}/login/request`;
const loginUrl = `${baseUrl}/login`;

describe("Unit tests for registration", () => {
  beforeEach(() => {
    mock = new MockAdapter(axios);
  });

  const email = "foo@bar.com";

  it("should register a new user", async () => {
    mock.onGet(registerRequestUrl).replyOnce(200, { challenge: "490ccffbbbcc304652488903ca425d42" }, {});
    console.log(registerRequestUrl);

    await register(client, seed, email);
  });
});
