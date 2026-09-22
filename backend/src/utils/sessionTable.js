import { InternalError, NotFound, logError } from "../error/index.js";
import { TableClient } from "@azure/data-tables";
import { getCredential } from "./obo.js";

const STORAGE_SCOPES = ["https://storage.azure.com/.default"];
const SESSION_TABLE_ACCOUNT_NAME = process.env.SESSION_TABLE_ACCOUNT_NAME;
export const SESSION_TABLE_NAME = process.env.SESSION_TABLE_NAME || "sessions";
const SESSION_PARTITION_KEY = "session";

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

/*
 * The three below take the caller's client, so each runs as whoever opened it. Between them they
 * are the only code that knows how a session is laid out in the table.
 */

export async function saveSession(tableClient, { sessionId, accessToken, expiresAt }) {
  await tableClient.upsertEntity(
    { partitionKey: SESSION_PARTITION_KEY, rowKey: sessionId, accessToken, expiresAt },
    "Replace",
  );
}

export async function readSession(tableClient, sessionId) {
  let entity;
  try {
    entity = await tableClient.getEntity(SESSION_PARTITION_KEY, sessionId);
  } catch (err) {
    if (err?.statusCode === 404) throw NotFound({ cause: err, meta: { reason: "session_not_found" } });
    throw err;
  }
  return { accessToken: entity.accessToken, expiresAt: Number(entity.expiresAt) };
}

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
