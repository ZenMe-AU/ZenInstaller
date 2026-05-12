import { app } from "@azure/functions";
import { Octokit } from "octokit";
import { verifyAuth } from "../utils/auth.js";
import { corsWrapper } from "../utils/cors.js";

app.http("getPullRequests", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const { accessToken } = await verifyAuth(request.headers.get("cookie"));
    const owner = request.query.get("owner");
    const repo = request.query.get("repo");
    const ref = request.query.get("ref") ?? "main";
    const state = "open";
    console.log("Fetching pull requests for ", { owner, repo, ref });
    const octokit = new Octokit({ auth: accessToken });
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
      owner,
      repo,
      state,
      // base: ref,
      // head: `${owner}:${ref}`
    });
    const pullRequestList = data.map(({ id, number, title, state, html_url, base, head }) => ({
      id,
      number,
      title,
      state,
      html_url,
      base_branch: base.ref,
      base_sha: base.sha,
      head_branch: head.ref,
      head_sha: head.sha,
    }));
    console.log("Pull Requests: ", data);
    return {
      jsonBody: { success: true, pullRequests: pullRequestList },
    };
  }),
});
