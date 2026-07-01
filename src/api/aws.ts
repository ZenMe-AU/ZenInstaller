import { STSClient, GetSessionTokenCommand, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { IAMClient, ListMFADevicesCommand } from "@aws-sdk/client-iam";
import { SESSION_DURATION_SECONDS } from "../config/awsConfig";

// AWS-specific prerequisite work for backend calls. The backend's IAM operations run
// with short-lived session credentials rather than the user's long-lived access keys,
// so we exchange them client-side via STS before handing them to the backend.

export type AwsSessionCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration?: Date;
};

export type AwsCallerIdentity = {
  accountId: string;
  arn: string;
  username: string;
};

export type AwsMfaDevice = {
  serialNumber: string;
  name: string;
  // true = TOTP (virtual app / hardware token) → GetSessionToken accepts a 6-digit code.
  // false = FIDO security key (u2f) → console-only, unusable for STS/CLI credentials.
  usable: boolean;
};

// Resolves who the given long-term credentials belong to, for a "signed in as …" display.
export async function getAwsCallerIdentity(accessKeyId: string, secretAccessKey: string): Promise<AwsCallerIdentity> {
  const sts = new STSClient({ region: "us-east-1", credentials: { accessKeyId, secretAccessKey } });
  const { Account, Arn } = await sts.send(new GetCallerIdentityCommand({}));
  if (!Account || !Arn) throw new Error("Failed to resolve AWS caller identity");
  return { accountId: Account, arn: Arn, username: Arn.split("/").pop() ?? Arn };
}

// Lists the user's registered MFA devices. Empty array means no MFA is enrolled.
// The ARN resource type distinguishes TOTP (arn:…:mfa/<name>, usable via STS) from
// FIDO security keys (arn:…:u2f/…, console-only). The friendly name is the last segment.
export async function getAwsMfaDevices(accessKeyId: string, secretAccessKey: string): Promise<AwsMfaDevice[]> {
  const iam = new IAMClient({ region: "us-east-1", credentials: { accessKeyId, secretAccessKey } });
  const { MFADevices } = await iam.send(new ListMFADevicesCommand({}));
  return (MFADevices ?? [])
    .filter((d) => d.SerialNumber)
    .map((d) => {
      const serial = d.SerialNumber;
      const resourceType = serial.split(":").pop()?.split("/")[0] ?? "";
      return { serialNumber: serial, name: serial.split("/").pop() ?? serial, usable: resourceType === "mfa" };
    });
}

export async function getAwsSessionCredentials(
  accessKeyId: string,
  secretAccessKey: string,
  mfa?: { serialNumber: string; tokenCode: string },
): Promise<AwsSessionCredentials> {
  const sts = new STSClient({ region: "us-east-1", credentials: { accessKeyId, secretAccessKey } });
  const session = await sts.send(
    new GetSessionTokenCommand({
      DurationSeconds: SESSION_DURATION_SECONDS,
      ...(mfa ? { SerialNumber: mfa.serialNumber, TokenCode: mfa.tokenCode } : {}),
    }),
  );
  const { AccessKeyId, SecretAccessKey, SessionToken, Expiration } = session.Credentials ?? {};
  if (!AccessKeyId || !SecretAccessKey || !SessionToken) {
    throw new Error("Failed to obtain temporary credentials from AWS STS");
  }
  return { accessKeyId: AccessKeyId, secretAccessKey: SecretAccessKey, sessionToken: SessionToken, expiration: Expiration };
}
