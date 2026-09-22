import { InternalError, logError } from "../error/index.js";
import { TableClient } from "@azure/data-tables";
import { getCredential } from "./obo.js";

const STORAGE_SCOPES = ["https://storage.azure.com/.default"];
const SESSION_TABLE_ACCOUNT_NAME = process.env.SESSION_TABLE_ACCOUNT_NAME;
export const SESSION_TABLE_NAME = process.env.SESSION_TABLE_NAME || "sessions";
export const SESSION_PARTITION_KEY = "session";

// Acts as the caller via OBO, so userToken is required.
export async function getTableClient(userToken) {
  if (!SESSION_TABLE_ACCOUNT_NAME) {
    throw InternalError({ meta: { missing: "SESSION_TABLE_ACCOUNT_NAME" } });
  }

  const url = `https://${SESSION_TABLE_ACCOUNT_NAME}.table.core.windows.net`;
  const credential = await getCredential(STORAGE_SCOPES, userToken);
  // The table itself is created by the deployment terminal card, so it is assumed to exist here.
  return new TableClient(url, SESSION_TABLE_NAME, credential);
}

// Takes the caller's client, so the delete runs as whoever opened it.
export async function deleteSessionEntity(tableClient, sessionId) {
  try {
    await tableClient.deleteEntity(SESSION_PARTITION_KEY, sessionId);
  } catch (err) {
    // Already gone is the outcome the caller wanted.
    if (err?.statusCode === 404) return;
    // Missing RBAC is never what anyone wanted, so the caller hears about it rather than a false success.
    if (err?.statusCode === 403) throw err;
    logError(err);
  }
}
