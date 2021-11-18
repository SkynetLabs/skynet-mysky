import { KeyPair, SkynetClient } from "skynet-js";
import type { CustomClientOptions } from "skynet-js";
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
 * Custom register options.
 *
 * @property [endpointRegisterRequest] - The relative URL path of the portal endpoint to contact.
 * @property [endpointRegister] - The relative URL path of the portal endpoint to contact for large uploads.
 */
export type CustomRegisterOptions = CustomClientOptions & {
  endpointRegister?: string;
  endpointRegisterRequest?: string;
};

/**
 * Custom login options.
 *
 * @property [endpointLoginRequest] - The relative URL path of the portal endpoint to contact.
 * @property [endpointLogin] - The relative URL path of the portal endpoint to contact for large uploads.
 */
export type CustomLoginOptions = CustomClientOptions & {
  endpointLogin?: string;
  endpointLoginRequest?: string;
};

/**
 * The default custom client options.
 */
const DEFAULT_CUSTOM_CLIENT_OPTIONS = {
  APIKey: "",
  customUserAgent: "",
  customCookie: "",
  onDownloadProgress: undefined,
  onUploadProgress: undefined,
};

export const DEFAULT_REGISTER_OPTIONS = {
  ...DEFAULT_CUSTOM_CLIENT_OPTIONS,

  endpointRegisterRequest: "/api/register/request",
  endpointRegister: "/api/register",
};

export const DEFAULT_LOGIN_OPTIONS = {
  ...DEFAULT_CUSTOM_CLIENT_OPTIONS,

  endpointLoginRequest: "/api/login/request",
  endpointLogin: "/api/login",
};

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
export async function register(
  client: SkynetClient,
  seed: Uint8Array,
  email: string,
  customOptions?: CustomRegisterOptions
): Promise<string> {
  const opts = { ...DEFAULT_REGISTER_OPTIONS, ...client.customOptions, ...customOptions };

  const { publicKey, privateKey } = genPortalLoginKeypair(seed, email);

  const registerRequestResponse = await client.executeRequest({
    endpointPath: opts.endpointRegisterRequest,
    method: "POST",
    subdomain: "account",
    query: { pubKey: publicKey },
  });

  const challenge = registerRequestResponse.data.challenge;
  // TODO: Get the recipient.
  const portal = "siasky.dev";
  const challengeResponse = signChallenge(privateKey, challenge, CHALLENGE_TYPE_REGISTER, portal);

  const data = {
    response: challengeResponse.response,
    signature: challengeResponse.signature,
    email,
  };
  const registerResponse = await client.executeRequest({
    endpointPath: opts.endpointRegister,
    method: "POST",
    subdomain: "account",
    data,
  });

  const jwt = registerResponse.headers["Skynet-Cookie"];
  return jwt;
}

/**
 * @returns - The JWT token.
 */
export async function login(
  client: SkynetClient,
  seed: Uint8Array,
  email: string,
  customOptions?: CustomLoginOptions
): Promise<string> {
  const opts = { ...DEFAULT_LOGIN_OPTIONS, ...client.customOptions, ...customOptions };

  const { publicKey, privateKey } = genPortalLoginKeypair(seed, email);

  const registerRequestResponse = await client.executeRequest({
    endpointPath: opts.endpointLoginRequest,
    method: "POST",
    subdomain: "account",
    query: { pubKey: publicKey },
  });

  const challenge = registerRequestResponse.data.challenge;
  // TODO: Get the recipient.
  const portal = "siasky.dev";
  const challengeResponse = signChallenge(privateKey, challenge, CHALLENGE_TYPE_LOGIN, portal);

  const data = challengeResponse;
  const registerResponse = await client.executeRequest({
    endpointPath: opts.endpointLogin,
    method: "POST",
    subdomain: "account",
    data,
  });

  const jwt = registerResponse.headers["Skynet-Cookie"];
  return jwt;
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
