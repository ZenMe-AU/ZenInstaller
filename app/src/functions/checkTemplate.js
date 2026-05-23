import { app } from "@azure/functions";
import { Octokit } from "octokit";
import { getAccessToken } from "../utils/auth.js";
import { corsWrapper } from "../utils/cors.js";

app.http("checkTemplate", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const templateOwner = "ZenMe-AU";

    const accessToken = getAccessToken(request);

    const type = request.query.get("type");
    const owner = request.query.get("owner");
    const repo = request.query.get("repo");

    const octokit = new Octokit({ auth: accessToken });
    const { data } = await octokit.request("GET /repos/{owner}/{repo}", { owner, repo });
    const isTemplate = data.template_repository && data.template_repository.owner.login === templateOwner ? true : false;
    const templateName = isTemplate ? data.template_repository.full_name : undefined;
    return {
      jsonBody: { success: true, isTemplate, templateName },
    };
  }),
});
