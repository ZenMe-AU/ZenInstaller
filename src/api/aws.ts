import { STSClient, GetSessionTokenCommand } from "@aws-sdk/client-sts";

// AWS-specific prerequisite work for backend calls. The backend's IAM operations run
// with short-lived session credentials rather than the user's long-lived access keys,
// so we exchange them client-side via STS before handing them to the backend.

export type AwsSessionCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
};

export async function getAwsSessionCredentials(accessKeyId: string, secretAccessKey: string): Promise<AwsSessionCredentials> {
  const sts = new STSClient({ region: "us-east-1", credentials: { accessKeyId, secretAccessKey } });
  const session = await sts.send(new GetSessionTokenCommand({ DurationSeconds: 900 }));
  const { AccessKeyId, SecretAccessKey, SessionToken } = session.Credentials ?? {};
  if (!AccessKeyId || !SecretAccessKey || !SessionToken) {
    throw new Error("Failed to obtain temporary credentials from AWS STS");
  }
  return { accessKeyId: AccessKeyId, secretAccessKey: SecretAccessKey, sessionToken: SessionToken };
}
