import type { CardStatus } from "../types";
import { AZURE_CLIENT_ID } from "../config/azureConfig";
import type { useAzureAccessPass } from "../hooks/useAzureAccessPass";
import StepWrapper from "../../access-pass-src/components/StepWrapper";
import AzureAccessPassCard from "../cards/AzureAccessPassDetails";

type Props = ReturnType<typeof useAzureAccessPass> & {
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled: boolean;
  validEnvs: readonly string[];
  onComplete: (done: boolean) => void;
};

export default function AzureAccessPass({ status, expanded, onToggle, disabled, validEnvs, onComplete, ...azureSetup }: Props) {
  if (!AZURE_CLIENT_ID) return null;

  const subtitle = azureSetup.result
    ? `Access pass created`
    : azureSetup.azureAccount
      ? `Signed in as ${azureSetup.azureAccount.username}`
      : "Create Temporary Access Pass for selected user";

  return (
    <StepWrapper title="Azure Access Pass" subtitle={subtitle} status={status} expanded={expanded} onToggle={onToggle}>
      <AzureAccessPassCard {...azureSetup} disabled={disabled} validEnvs={validEnvs} onComplete={onComplete} />
    </StepWrapper>
  );
}
