import { app } from "@azure/functions";
import { Octokit } from "octokit";
import { getAccessToken } from "../utils/auth.js";
import { corsWrapper } from "../utils/cors.js";

app.http("triggerActions", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const accessToken = getAccessToken(request);

    const body = await request.json();
    const { env, workflow_id, ref = "main", type, owner, repo } = body;

    const octokit = new Octokit({ auth: accessToken });
    const { data } = await octokit.request(`POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`, {
      owner,
      repo,
      workflow_id,
      ref,
      inputs: { env },
      headers: {
        "X-GitHub-Api-Version": "2026-03-10",
      },
    });

    return {
      jsonBody: { success: true, id: data.workflow_run_id },
    };
  }),
});
