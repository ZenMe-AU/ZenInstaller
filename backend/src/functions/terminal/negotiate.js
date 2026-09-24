import { app } from "@azure/functions";
import { requireAuth } from "../../utils/auth.js";
import { corsWrapper } from "../../utils/cors.js";
import { Forbidden, HttpError, MissingParam, logError } from "../../error/index.js";
import { deleteSessionEntity, getTableClient, readSession } from "../../utils/sessionTable.js";
import { getPubSubClient, normalizeTokenResponse } from "../../utils/webPubSub.js";

app.http("negotiate", {
  methods: ["POST"],
  route: "terminal/negotiate",
  authLevel: "anonymous",
  handler: corsWrapper(
    requireAuth({ ms: true, msRbac: ["Web PubSub Service Owner"] })(async (request) => {
      const sessionId = request.query.get("session");
      const token = request.query.get("token");

      if (!sessionId || !token) {
        throw MissingParam({ meta: { required: ["session", "token"] } });
      }

      const tableClient = await getTableClient(request.auth.msToken);

      const session = await readSession(tableClient, sessionId);

      if (Date.now() > session.expiresAt) {
        // Tell the caller the session expired even if this cleanup fails.
        await deleteSessionEntity(tableClient, sessionId).catch(logError);
        throw new HttpError(410, "Session expired");
      }

      if (session.accessToken !== token) {
        throw Forbidden({ meta: { reason: "invalid_session_token" } });
      }

      // Web PubSub publishes no delegated permission, so this one runs as the app.
      // const wsClient = await getPubSubClient(request.auth.msToken);
      const wsClient = getPubSubClient();
      const tokenResponse = await wsClient.getClientAccessToken({
        roles: [`webpubsub.joinLeaveGroup.${sessionId}`, `webpubsub.sendToGroup.${sessionId}`],
        expiresInMinutes: 30,
      });

      return { jsonBody: { url: normalizeTokenResponse(tokenResponse) } };
    }),
  ),
});
