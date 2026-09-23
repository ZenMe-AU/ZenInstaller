import { InternalError } from "../error/index.js";
import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { getAppCredential } from "./obo.js";

// The SDK wants a bare host, so any scheme or trailing slash is stripped rather than concatenated.
const WEBPUBSUB_ENDPOINT = process.env.WEBPUBSUB_ENDPOINT?.trim()
  .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
  .replace(/\/+$/, "");
const HUB_NAME = process.env.HUB_NAME || "terminal";

// The on-behalf-of version
// const WEBPUBSUB_SCOPES = ["https://webpubsub.azure.com/.default"];

// export async function getPubSubClient(userToken) {
//  if (!WEBPUBSUB_ENDPOINT) {
//    throw InternalError({ meta: { missing: "WEBPUBSUB_ENDPOINT" } });
//  }

//  const credential = await getCredential(WEBPUBSUB_SCOPES, userToken);
//  return new WebPubSubServiceClient(`https://${WEBPUBSUB_ENDPOINT}`, credential, HUB_NAME);
// }

let appPubSubClient = null;
export function getPubSubClient() {
  if (!WEBPUBSUB_ENDPOINT) {
    throw InternalError({ meta: { missing: "WEBPUBSUB_ENDPOINT" } });
  }
  const credential = getAppCredential();
  return (appPubSubClient ??= new WebPubSubServiceClient(`https://${WEBPUBSUB_ENDPOINT}`, credential, HUB_NAME));
}

export function normalizeTokenResponse(tokenResponse) {
  if (typeof tokenResponse === "string") {
    return tokenResponse;
  }

  if (typeof tokenResponse?.url === "string") {
    return tokenResponse.url;
  }

  if (tokenResponse?.url && typeof tokenResponse.url.url === "string") {
    return tokenResponse.url.url;
  }

  throw InternalError({ meta: { reason: "unexpected_token_response", tokenResponse } });
}
