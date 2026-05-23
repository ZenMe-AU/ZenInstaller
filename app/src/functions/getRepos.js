import { app } from "@azure/functions";
import { Octokit } from "octokit";
import { getAccessToken } from "../utils/auth.js";
import { corsWrapper } from "../utils/cors.js";

app.http("getRepos", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const accessToken = getAccessToken(request);

    const type = request.query.get("type");
    const owner = request.query.get("owner");

    const octokit = new Octokit({ auth: accessToken });
    const uri = type === "User" ? "/user/repos" : `/orgs/${owner}/repos`;
    const { data } = await octokit.request(`GET ${uri}`);
    const repoList = data.filter((repo) => repo.owner.type === type).map((repo) => ({ name: repo.name, id: repo.id, full_name: repo.full_name }));
    return {
      jsonBody: { success: true, repoList },
    };
  }),
});
