import jwt_decode from "jwt-decode";
import { KeyPair, SkynetClient } from "skynet-js";
import type { CustomClientOptions } from "skynet-js";
import { sign } from "tweetnacl";

import { genKeyPairFromHash, hashWithSalt } from "./crypto";
import { hexToUint8Array, stringToUint8ArrayUtf8, toHexString, validateHexString, validateUint8ArrayLen } from "./util";

// TODO: This is temporary for testing purposes. This should be changed to
// `set-cookie` (will only work in the browser).
/**
 * The name of the response header containing the cookie.
 */
export const COOKIE_HEADER_NAME = "skynet-token";

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

export type JWTData = { session: { identity: { traits: { email: string } } } };

/**
 * Hack that allows us to use ?. optional chaining on unknown types in Typescript.
 *
 * See https://github.com/microsoft/TypeScript/issues/37700#issuecomment-940865298
 */
type Unreliable<T> = { [P in keyof T]?: Unreliable<T[P]> } | undefined;

type JWTResult = Unreliable<JWTData>;

/**
 * Custom register options.
 *
 * @property [endpointRegister] - The relative URL path of the portal endpoint to contact for large uploads.
 * @property [endpointRegisterRequest] - The relative URL path of the portal endpoint to contact.
 */
export type CustomRegisterOptions = CustomClientOptions & {
  endpointRegister?: string;
  endpointRegisterRequest?: string;
};

/**
 * Custom login options.
 *
 * @property [endpointLogin] - The relative URL path of the portal endpoint to contact for large uploads.
 * @property [endpointLoginRequest] - The relative URL path of the portal endpoint to contact.
 */
export type CustomLoginOptions = CustomClientOptions & {
  endpointLogin?: string;
  endpointLoginRequest?: string;
};

/**
 * Custom logout options.
 *
 * @property [endpointLogout] - The relative URL path of the portal endpoint to contact for large uploads.
 */
export type CustomLogoutOptions = CustomClientOptions & {
  endpointLogout?: string;
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

  endpointRegister: "/api/register",
  endpointRegisterRequest: "/api/register",
};

export const DEFAULT_LOGIN_OPTIONS = {
  ...DEFAULT_CUSTOM_CLIENT_OPTIONS,

  endpointLogin: "/api/login",
  endpointLoginRequest: "/api/login",
};

export const DEFAULT_LOGOUT_OPTIONS = {
  ...DEFAULT_CUSTOM_CLIENT_OPTIONS,

  endpointLogout: "/api/logout",
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

// ===
// API
// ===

/**
 * Registers a user for the given seed and email.
 *
 * @param client - The Skynet client.
 * @param seed - The seed.
 * @param email - The user email.
 * @param [customOptions] - The custom register options.
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
    method: "GET",
    subdomain: "account",
    query: { pubKey: publicKey },
  });

  const challenge = registerRequestResponse.data.challenge;
  const portalRecipient = getPortalRecipient(await client.portalUrl());
  const challengeResponse = signChallenge(privateKey, challenge, CHALLENGE_TYPE_REGISTER, portalRecipient);

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

  const jwt = registerResponse.headers[COOKIE_HEADER_NAME];
  const decodedEmail = getEmailFromJWT(jwt);
  if (decodedEmail !== email) {
    throw new Error("Email not found in JWT or did not match provided email");
  }
  return jwt;
}

/**
 * Logs in a user for the given seed and email.
 *
 * @param client - The Skynet client.
 * @param seed - The seed.
 * @param email - The user email.
 * @param [customOptions] - The custom login options.
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

  const loginRequestResponse = await client.executeRequest({
    endpointPath: opts.endpointLoginRequest,
    method: "GET",
    subdomain: "account",
    query: { pubKey: publicKey },
  });

  const challenge = loginRequestResponse.data.challenge;
  const portalRecipient = getPortalRecipient(await client.portalUrl());
  const challengeResponse = signChallenge(privateKey, challenge, CHALLENGE_TYPE_LOGIN, portalRecipient);

  const data = challengeResponse;
  const loginResponse = await client.executeRequest({
    endpointPath: opts.endpointLogin,
    method: "POST",
    subdomain: "account",
    data,
  });

  const jwt = loginResponse.headers[COOKIE_HEADER_NAME];
  const decodedEmail = getEmailFromJWT(jwt);
  if (decodedEmail !== email) {
    throw new Error(
      `Email not found in JWT or did not match provided email. Expected: '${email}', received: '${decodedEmail}'`
    );
  }
  return jwt;
}

/**
 * Logs out a logged-in user.
 *
 * @param client - The Skynet client.
 * @param [customOptions] - The custom logout options.
 */
export async function logout(client: SkynetClient, customOptions?: CustomLogoutOptions): Promise<void> {
  const opts = { ...DEFAULT_LOGOUT_OPTIONS, ...client.customOptions, ...customOptions };

  await client.executeRequest({
    endpointPath: opts.endpointLogout,
    method: "POST",
    subdomain: "account",
  });
}

// =======
// Helpers
// =======

/**
 * Decodes the given JWT and extracts the email, if found.
 *
 * @param jwt - The given JWT string.
 * @returns - The email in the JWT, or undefined.
 */
export function getEmailFromJWT(jwt: string): string | undefined {
  const decodedJWT = jwt_decode(jwt) as JWTResult;
  return decodedJWT?.session?.identity?.traits?.email;
}

/**
 * Signs the given challenge.
 *
 * @param privateKey - The user's login private key.
 * @param challenge - The challenge received from the server.
 * @param challengeType - The type of the challenge.
 * @param portalRecipient - The portal we are communicating with.
 * @returns - The challenge response from the client.
 */
function signChallenge(
  privateKey: string,
  challenge: string,
  challengeType: "skynet-portal-login" | "skynet-portal-register",
  portalRecipient: string
): ChallengeResponse {
  validateHexString("challenge", challenge, "challenge from server");

  const challengeBytes = hexToUint8Array(challenge);
  validateUint8ArrayLen("challengeBytes", challengeBytes, "calculated challenge bytes", CHALLENGE_SIZE);

  const typeBytes = stringToUint8ArrayUtf8(challengeType);

  const portalBytes = stringToUint8ArrayUtf8(portalRecipient);

  const dataBytes = new Uint8Array([...challengeBytes, ...typeBytes, ...portalBytes]);

  const privateKeyBytes = hexToUint8Array(privateKey);
  const signatureBytes = sign(dataBytes, privateKeyBytes).slice(0, CHALLENGE_SIGNATURE_SIZE);
  validateUint8ArrayLen("signatureBytes", signatureBytes, "calculated signature", CHALLENGE_SIGNATURE_SIZE);

  return {
    response: toHexString(dataBytes),
    signature: toHexString(signatureBytes),
  };
}

/**
 * Generates a portal login keypair.
 *
 * @param seed - The user seed.
 * @param email - The email.
 * @returns - The login keypair.
 */
function genPortalLoginKeypair(seed: Uint8Array, email: string): KeyPair {
  const hash = hashWithSalt(seed, email);

  return genKeyPairFromHash(hash);
}

/**
 * Gets the portal recipient string from the portal URL, e.g. siasky.net =>
 * siasky.net, dev1.siasky.dev => siasky.dev.
 *
 * @param portalUrl - The full portal URL.
 * @returns - The shortened portal recipient name.
 */
function getPortalRecipient(portalUrl: string): string {
  const url = new URL(portalUrl);

  // Get last two portions of the hostname.
  return url.hostname.split(".").slice(-2).join(".");
}
