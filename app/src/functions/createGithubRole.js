import { app } from "@azure/functions";
import { IAMClient, CreateRoleCommand, AttachRolePolicyCommand, CreateOpenIDConnectProviderCommand, GetRoleCommand, UpdateAssumeRolePolicyCommand } from "@aws-sdk/client-iam";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { corsWrapper } from "../utils/cors.js";
import { HttpError } from "../error/index.js";

const GITHUB_OIDC_URL = "https://token.actions.githubusercontent.com";
const GITHUB_THUMBPRINTS = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"];
const GITHUB_AUD_KEY = "token.actions.githubusercontent.com:aud";
const GITHUB_SUB_KEY = "token.actions.githubusercontent.com:sub";

app.http("createGithubRole", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "api/aws/create-github-role",
  handler: corsWrapper(async (request) => {
    const { accessKeyId, secretAccessKey, sessionToken, org, repo, environments, roleName, createOidcProvider } = await request.json();

    if (!accessKeyId || !secretAccessKey || !sessionToken) {
      throw new HttpError(400, "Missing AWS credentials");
    }
    if (!org || !repo || !roleName || !environments?.length) {
      throw new HttpError(400, "Missing required parameters");
    }

    const credentials = { accessKeyId, secretAccessKey, sessionToken };

    const sts = new STSClient({ region: "us-east-1", credentials });
    const iam = new IAMClient({ region: "us-east-1", credentialProvider: credentials });

    try {
      const { Account: accountId } = await sts.send(new GetCallerIdentityCommand({}));

      if (createOidcProvider) {
        try {
          await iam.send(
            new CreateOpenIDConnectProviderCommand({
              Url: GITHUB_OIDC_URL,
              ClientIDList: ["sts.amazonaws.com"],
              ThumbprintList: GITHUB_THUMBPRINTS,
            }),
          );
        } catch (err) {
          if (err.name !== "EntityAlreadyExistsException") throw err;
        }
      }

      const oidcProviderArn = `arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`;
      const newSubs = environments.map((env) => `repo:${org}/${repo}:environment:${env}`);

      const newStatement = {
        Effect: "Allow",
        Principal: { Federated: oidcProviderArn },
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {
          StringEquals: { [GITHUB_AUD_KEY]: "sts.amazonaws.com" },
          StringLike: { [GITHUB_SUB_KEY]: newSubs },
        },
      };

      let roleArn;
      let updated = false;

      try {
        const createRes = await iam.send(
          new CreateRoleCommand({
            RoleName: roleName,
            AssumeRolePolicyDocument: JSON.stringify({ Version: "2012-10-17", Statement: [newStatement] }),
            Description: `GitHub Actions OIDC role for ${org}/${repo}`,
          }),
        );
        roleArn = createRes.Role.Arn;
      } catch (err) {
        if (err.name !== "EntityAlreadyExistsException") throw err;

        // Role exists — merge selected environments into the trust policy.
        const existing = await iam.send(new GetRoleCommand({ RoleName: roleName }));
        roleArn = existing.Role.Arn;

        let mergedPolicy;
        let existingPolicyObj;
        try {
          existingPolicyObj = JSON.parse(decodeURIComponent(existing.Role.AssumeRolePolicyDocument));
        } catch (_e) {
          existingPolicyObj = null;
        }

        if (existingPolicyObj) {
          // Find an existing GitHub OIDC statement to merge subs into.
          const githubStmt = existingPolicyObj.Statement?.find((s) => s.Condition?.StringLike?.[GITHUB_SUB_KEY] !== undefined);
          if (githubStmt) {
            const existingSubs = [].concat(githubStmt.Condition.StringLike[GITHUB_SUB_KEY]);
            githubStmt.Condition.StringLike[GITHUB_SUB_KEY] = [...new Set([...existingSubs, ...newSubs])];
          } else {
            // Unrecognized trust policy structure — append a new statement.
            existingPolicyObj.Statement = [...(existingPolicyObj.Statement ?? []), newStatement];
          }
          mergedPolicy = existingPolicyObj;
        } else {
          // Unparseable document — replace with minimal policy containing our statement.
          mergedPolicy = { Version: "2012-10-17", Statement: [newStatement] };
        }

        await iam.send(new UpdateAssumeRolePolicyCommand({ RoleName: roleName, PolicyDocument: JSON.stringify(mergedPolicy) }));
        updated = true;
      }

      // Idempotent — safe to call even if the policy is already attached.
      await iam.send(new AttachRolePolicyCommand({ RoleName: roleName, PolicyArn: "arn:aws:iam::aws:policy/AdministratorAccess" }));

      return { jsonBody: { roleArn, updated } };
    } catch (err) {
      // Surface AWS SDK errors (InvalidClientTokenId, AccessDenied, EntityAlreadyExists, ...)
      // with their real status/message instead of a generic 500.
      const status = err.$metadata?.httpStatusCode ?? 502;
      const message = err.name ? `${err.name}: ${err.message}` : err.message || "AWS request failed";
      throw new HttpError(status, message, { cause: err });
    }
  }),
});
