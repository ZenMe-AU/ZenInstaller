import type { CardStatus } from "../types";
import type { useAwsSetup } from "../hooks/useAwsSetup";
import StepWrapper from "../components/StepWrapper";
import AwsCfnCard from "../cards/AwsCfnCard";

type Props = ReturnType<typeof useAwsSetup> & {
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled: boolean;
  validEnvs: readonly string[];
  onComplete: (done: boolean) => void;
};

export default function AwsSetupStep({ status, expanded, onToggle, disabled, validEnvs, onComplete, ...awsSetup }: Props) {
  const subtitle = awsSetup.roleArn ? `Role: ${awsSetup.roleArn}` : "Create GitHub Actions OIDC role via the IAM API";

  return (
    <StepWrapper title="AWS IAM Role" subtitle={subtitle} status={status} expanded={expanded} onToggle={onToggle}>
      <AwsCfnCard {...awsSetup} validEnvs={validEnvs} disabled={disabled} onComplete={onComplete} />
    </StepWrapper>
  );
}
