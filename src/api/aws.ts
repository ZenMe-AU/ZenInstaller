import { STSClient, GetSessionTokenCommand } from "@aws-sdk/client-sts";

const apiUrl = import.meta.env.VITE_API_URL;

export type CreateGithubRoleParams = {
  accessKeyId: string;
  secretAccessKey: string;
  org: string;
  repo: string;
  environments: string[];
  roleName: string;
  createOidcProvider: boolean;
};

export async function createGithubRole({ accessKeyId, secretAccessKey, ...rest }: CreateGithubRoleParams): Promise<{ roleArn: string; updated: boolean }> {
  const sts = new STSClient({ region: "us-east-1", credentials: { accessKeyId, secretAccessKey } });
  const session = await sts.send(new GetSessionTokenCommand({ DurationSeconds: 900 }));
  const { AccessKeyId, SecretAccessKey, SessionToken } = session.Credentials ?? {};
  if (!AccessKeyId || !SecretAccessKey || !SessionToken) {
    throw new Error("Failed to obtain temporary credentials from AWS STS");
  }

  const res = await fetch(`${apiUrl}/api/aws/create-github-role`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKeyId: AccessKeyId, secretAccessKey: SecretAccessKey, sessionToken: SessionToken, ...rest }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return { roleArn: data.roleArn as string, updated: data.updated as boolean };
}
