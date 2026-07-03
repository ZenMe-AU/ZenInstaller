import type { Account, CardStatus, GhEnv } from "../types";
import type { useAwsSetup } from "../hooks/useAwsSetup";
import StepWrapper from "../components/StepWrapper";
import AwsCfnCard from "../cards/AwsCfnCard";

type Props = ReturnType<typeof useAwsSetup> & {
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled: boolean;
  account: Account | null;
  repoName: string;
  repoFullName: string | null;
  selectedEnv: GhEnv | null;
  onComplete: (done: boolean) => void;
  onAwsValid?: (valid: boolean | null) => void;
};

export default function AwsSetupStep({
  status,
  expanded,
  onToggle,
  disabled,
  account,
  repoName,
  repoFullName,
  selectedEnv,
  onComplete,
  onAwsValid,
  ...awsSetup
}: Props) {
  const subtitle =
    status === "complete"
      ? "Connection details already filled in"
      : awsSetup.signedIn
        ? `Signed in as ${awsSetup.identity?.username ?? "AWS"}`
        : "Not yet connected — give GitHub Actions access to deploy to AWS";

  const githubUrl =
    repoFullName && selectedEnv
      ? `https://github.com/${repoFullName}/settings/environments/${selectedEnv.id}/edit`
      : undefined;

  return (
    <StepWrapper title="Let GitHub deploy to AWS" subtitle={subtitle} status={status} expanded={expanded} onToggle={onToggle} disabled={disabled}>
      <AwsCfnCard
        {...awsSetup}
        account={account}
        repoName={repoName}
        selectedEnv={selectedEnv}
        disabled={disabled}
        onComplete={onComplete}
        githubUrl={githubUrl}
        onAwsValid={onAwsValid}
      />
    </StepWrapper>
  );
}
