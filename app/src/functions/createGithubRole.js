import { app } from "@azure/functions";
import { IAMClient, CreateRoleCommand, AttachRolePolicyCommand, CreateOpenIDConnectProviderCommand } from "@aws-sdk/client-iam";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { corsWrapper } from "../utils/cors.js";
import { HttpError } from "../error/index.js";

const GITHUB_OIDC_URL = "https://token.actions.githubusercontent.com";
const GITHUB_THUMBPRINTS = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"];

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
      const subjectConditions = environments.map((env) => `repo:${org}/${repo}:environment:${env}`);

      const trustPolicy = {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Federated: oidcProviderArn },
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
              StringLike: { "token.actions.githubusercontent.com:sub": subjectConditions },
            },
          },
        ],
      };

      const createRoleRes = await iam.send(
        new CreateRoleCommand({
          RoleName: roleName,
          AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
          Description: `GitHub Actions OIDC role for ${org}/${repo}`,
        }),
      );

      await iam.send(
        new AttachRolePolicyCommand({
          RoleName: roleName,
          PolicyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
        }),
      );

      return { jsonBody: { roleArn: createRoleRes.Role.Arn } };
    } catch (err) {
      // Surface AWS SDK errors (InvalidClientTokenId, AccessDenied, EntityAlreadyExists, ...)
      // with their real status/message instead of a generic 500.
      const status = err.$metadata?.httpStatusCode ?? 502;
      const message = err.name ? `${err.name}: ${err.message}` : err.message || "AWS request failed";
      throw new HttpError(status, message, { cause: err });
    }
  }),
});
