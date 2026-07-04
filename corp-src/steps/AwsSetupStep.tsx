import type { Account, CardStatus, GhEnv } from "../../access-pass-src/types";
import type { useAwsSetup } from "../hooks/useAwsSetup";
import StepWrapper from "../../corp-src/components/StepWrapper";
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
  ...awsSetup
}: Props) {
  const subtitle = awsSetup.roleArn ? "IAM role ready · review & save AWS_ROLE_ARN" : "Give GitHub Actions access to deploy to AWS";

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
      />
    </StepWrapper>
  );
}
