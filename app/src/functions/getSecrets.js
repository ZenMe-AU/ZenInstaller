import { app } from "@azure/functions";
import { Octokit } from "octokit";
import { getAccessToken } from "../utils/auth.js";
import { corsWrapper } from "../utils/cors.js";

app.http("getSecrets", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const accessToken = getAccessToken(request);
    const owner = request.query.get("owner");
    const repo = request.query.get("repo");
    const env = request.query.get("env");

    const octokit = new Octokit({ auth: accessToken });

    const uri = env ? "/repos/{owner}/{repo}/environments/{environment_name}/secrets" : "/repos/{owner}/{repo}/actions/secrets";
    const params = { owner, repo, environment_name: env };
    console.log("uri:", uri);
    console.log("Requesting secrets with params:", params);
    const { data } = await octokit.request(uri, params);
    const secretList = data.secrets.map(({ name }) => name);
    return {
      jsonBody: { success: true, secrets: secretList },
    };
  }),
});
