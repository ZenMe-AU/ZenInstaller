import type { CardStatus } from "../types";
import { AZURE_CLIENT_ID } from "../config/accessPassConfig";
import type { useAzureAccessPass } from "../hooks/useAccessPass";
import StepWrapper from "../components/StepWrapper";
import AzureAccessPassCard from "../cards/AccessPassCard";

type Props = ReturnType<typeof useAzureAccessPass> & {
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled: boolean;
  locked?: boolean;
  validEnvs: readonly string[];
  onComplete: (done: boolean) => void;
};

export default function AzureAccessPass({ status, expanded, onToggle, disabled, locked = false, validEnvs, onComplete, ...azureSetup }: Props) {
  if (!AZURE_CLIENT_ID) return null;

  const subtitle = locked
    ? "Complete Azure login and tenant ID first"
    : azureSetup.result
    ? `Access pass created`
    : azureSetup.azureAccount
      ? `Signed in as ${azureSetup.azureAccount.username}`
      : "Create Temporary Access Pass for selected user";

  return (
    <StepWrapper title="Azure Access Pass" subtitle={subtitle} status={status} expanded={expanded} onToggle={onToggle}>
      <AzureAccessPassCard {...azureSetup} disabled={disabled} locked={locked} validEnvs={validEnvs} onComplete={onComplete} />
    </StepWrapper>
  );
}
