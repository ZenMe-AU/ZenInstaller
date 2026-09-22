import { app } from "@azure/functions";
import { requireAuth } from "../../utils/auth.js";
import { corsWrapper } from "../../utils/cors.js";
import { Forbidden, HttpError, MissingParam, NotFound, logError } from "../../error/index.js";
import { SESSION_PARTITION_KEY, deleteSessionEntity, getTableClient } from "../../utils/sessionTable.js";
import { getPubSubClient, normalizeTokenResponse } from "../../utils/webPubSub.js";

app.http("negotiate", {
  methods: ["POST"],
  route: "terminal/negotiate",
  authLevel: "anonymous",
  handler: corsWrapper(
    requireAuth({ ms: true })(async (request) => {
      const sessionId = request.query.get("session");
      const token = request.query.get("token");

      if (!sessionId || !token) {
        throw MissingParam({ meta: { required: ["session", "token"] } });
      }

      const tableClient = await getTableClient(request.auth.msToken);

      let entity;
      try {
        entity = await tableClient.getEntity(SESSION_PARTITION_KEY, sessionId);
      } catch (err) {
        if (err?.statusCode === 404) throw NotFound({ cause: err, meta: { reason: "session_not_found" } });
        throw err;
      }

      if (Date.now() > Number(entity.expiresAt)) {
        // Tell the caller the session expired even if this cleanup fails.
        await deleteSessionEntity(tableClient, sessionId).catch(logError);
        throw new HttpError(410, "Session expired");
      }

      if (entity.accessToken !== token) {
        throw Forbidden({ meta: { reason: "invalid_session_token" } });
      }

      const wsClient = await getPubSubClient(request.auth.msToken);
      const tokenResponse = await wsClient.getClientAccessToken({
        roles: [`webpubsub.joinLeaveGroup.${sessionId}`, `webpubsub.sendToGroup.${sessionId}`],
        expiresInMinutes: 30,
      });

      return { jsonBody: { url: normalizeTokenResponse(tokenResponse) } };
    }),
  ),
});
