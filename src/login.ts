import { KeyPair, SkynetClient } from "skynet-js";
import { sign } from "tweetnacl";

import { genKeyPairDeterministic, sha512 } from "./crypto";
import { hexToUint8Array, stringToUint8ArrayUtf8, toHexString, validateHexString, validateUint8ArrayLen } from "./util";

/**
 * The size of the expected signature.
 */
const CHALLENGE_SIGNATURE_SIZE = sign.signatureLength;
/**
 * The number of bytes of entropy to send as a challenge.
 */
const CHALLENGE_SIZE = 32;
/**
 * The type of the login challenge.
 */
const CHALLENGE_TYPE_LOGIN = "skynet-portal-login";
/**
 * The type of the registration challenge.
 */
const CHALLENGE_TYPE_REGISTER = "skynet-portal-register";
/**
 * The length of the public key in bytes.
 */
const PUB_KEY_SIZE = sign.publicKeyLength;

/**
 * The challenge response.
 *
 * @property response - The hex-encoded byte array of the signed data, e.g. challenge+type+recipient. The type is either
 * `skynet-portal-login` or `skynet-portal-register`, depending on the endpoint on which the challenge was requested.
 * @property signature - The signature of the data.
 */
type ChallengeResponse = {
  response: string;
  signature: string;
};

// TODO: What will be the salt?
function genPortalLoginKeypair(seed: Uint8Array, salt: string): KeyPair {
  const hash = sha512(new Uint8Array([...sha512(salt), ...sha512(seed)]));

  return genKeyPairDeterministic(hash);
}

/**
 * @returns - The JWT token.
 */
export async function register(client: SkynetClient, seed: Uint8Array, email: string): Promise<string> {
  const { publicKey, privateKey } = genPortalLoginKeypair(seed, email);

  // TODO: Get accounts URL.
  const registerGETUrl = "https://account.dev3.siasky.dev/api/register";
  const portal = "siasky.dev";

  console.log("Sending register GET");

  // @ts-expect-error - Using protected method.
  const registerGETResponse = await client.executeRequest({
    url: registerGETUrl,
    endpointPath: "/register",
    method: "GET",
    query: { pubKey: publicKey },
  });

  console.log("Got register GET");

  const challenge = registerGETResponse.data.challenge;
  const challengeResponse = signChallenge(privateKey, challenge, CHALLENGE_TYPE_REGISTER, portal);

  // TODO: Get accounts URL.
  const registerPOSTUrl = "https://account.dev3.siasky.dev/api/register";

  const data = {
    response: challengeResponse.response,
    signature: challengeResponse.signature,
    email,
  };
  console.log("Sending register POST");
  try {
    // @ts-expect-error - Using protected method.
    const registerPOSTResponse = await client.executeRequest({
      url: registerPOSTUrl,
      endpointPath: "/register",
      method: "POST",
      data,
    });
    console.log(registerPOSTResponse);

    const jwt = registerPOSTResponse.headers["Skynet-Cookie"];
    return jwt;
  } catch (e) {
    console.log(e);
    throw e;
  }
}

function signChallenge(
  privateKey: string,
  challenge: string,
  challengeType: "skynet-portal-login" | "skynet-portal-register",
  portal: string
): ChallengeResponse {
  validateHexString("challenge", challenge, "challenge from server");

  const challengeBytes = hexToUint8Array(challenge);
  validateUint8ArrayLen("challengeBytes", challengeBytes, "calculated challenge bytes", CHALLENGE_SIZE);

  const typeBytes = stringToUint8ArrayUtf8(challengeType);

  const portalBytes = stringToUint8ArrayUtf8(portal);

  const dataBytes = new Uint8Array([...challengeBytes, ...typeBytes, ...portalBytes]);

  const privateKeyBytes = hexToUint8Array(privateKey);
  const signatureBytes = sign(dataBytes, privateKeyBytes).slice(0, CHALLENGE_SIGNATURE_SIZE);
  validateUint8ArrayLen("signatureBytes", signatureBytes, "calculated signature", CHALLENGE_SIGNATURE_SIZE);

  return {
    response: toHexString(dataBytes),
    signature: toHexString(signatureBytes),
  };
}
