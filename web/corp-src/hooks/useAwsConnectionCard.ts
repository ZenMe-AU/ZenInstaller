import type { CardHook, CardStatus } from "../types";
import { PIPELINE } from "../logic/pipeline";
import { AWS_VARIABLE_KEYS } from "../logic/variables";
import { useAwsSetup } from "./useAwsSetup";

export type UseAwsConnectionCardParams = {
  org: string;
  repo: string;
  variableValues: Record<string, string>;
};

export type UseAwsConnectionCard = CardHook &
  ReturnType<typeof useAwsSetup> & {
  readonly cardId: "aws_connection";
};

export function useAwsConnectionCard({ org, repo, variableValues }: UseAwsConnectionCardParams): UseAwsConnectionCard {
  const awsSetup = useAwsSetup({ org, repo, validEnvs: PIPELINE.validEnvs });
  const roleArn = variableValues[AWS_VARIABLE_KEYS[0]]?.trim() ?? "";
  const done = !!roleArn;
  const status: CardStatus = done ? "complete" : awsSetup.signedIn ? "warning" : "idle";
  const summary = done
    ? "Connection details already filled in"
    : awsSetup.signedIn
      ? `Signed in as ${awsSetup.identity?.username ?? "AWS"}`
      : "Not yet connected";

  return {
    ...awsSetup,
    cardId: "aws_connection",
    status,
    summary,
    cardRequirements: ["repo"],
    cardDependencyLabel: "Set up AWS connection",
    done,
  };
}
