import { app } from "@azure/functions";
import { requireAuth } from "../../utils/auth.js";
import { corsWrapper } from "../../utils/cors.js";
import { MissingParam } from "../../error/index.js";
import { deleteSessionEntity, getTableClient } from "../../utils/sessionTable.js";

app.http("deleteSession", {
  methods: ["DELETE"],
  route: "terminal/session/{id}",
  authLevel: "anonymous",
  handler: corsWrapper(
    requireAuth({ ms: true })(async (request, context) => {
      const sessionId = request.params.id;

      if (!sessionId) {
        throw MissingParam({ meta: { required: ["id"] } });
      }

      const tableClient = await getTableClient(request.auth.msToken);
      await deleteSessionEntity(tableClient, sessionId);
      context.log(`Session cleaned up: ${sessionId}`);
      return { jsonBody: { ok: true } };
    }),
  ),
});
