import type { CardStatus } from "../types";
import { AZURE_CLIENT_ID } from "../config/azureConfig";
import type { useAzureSetup } from "../hooks/useAzureSetup";
import StepWrapper from "../components/StepWrapper";
import AzureAppCard from "../cards/AzureAppCard";

type Props = ReturnType<typeof useAzureSetup> & {
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled: boolean;
  validEnvs: readonly string[];
  onComplete: (done: boolean) => void;
};

export default function AzureSetupStep({ status, expanded, onToggle, disabled, validEnvs, onComplete, ...azureSetup }: Props) {
  if (!AZURE_CLIENT_ID) return null;

  const subtitle = azureSetup.result
    ? `App: ${azureSetup.result.clientId}`
    : azureSetup.azureAccount
      ? `Signed in as ${azureSetup.azureAccount.username}`
      : "Create Azure app registration for GitHub OIDC";

  return (
    <StepWrapper title="Azure App Registration" subtitle={subtitle} status={status} expanded={expanded} onToggle={onToggle}>
      <AzureAppCard {...azureSetup} disabled={disabled} validEnvs={validEnvs} onComplete={onComplete} />
    </StepWrapper>
  );
}
