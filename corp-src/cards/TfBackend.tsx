import type { AccountInfo } from "@azure/msal-browser";
import type { CardStatus } from "../types";
import type { useTerraformSetup } from "../hooks/useTerraformSetup";
import StepWrapper from "../components/StepWrapper";
import TfBackendDetail from "./TfBackendDetail";
import { reactPlugin } from "../monitor/applicationInsights";
import { AppInsightsErrorBoundary } from "@microsoft/applicationinsights-react-js";

type Props = ReturnType<typeof useTerraformSetup> & {
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled: boolean;
  azureAccount: AccountInfo | null;
  corpName: string;
  subscriptionId: string;
  spClientId: string;
  storageReady: boolean;
};

export default function TfBackend({ status, expanded, onToggle, disabled, azureAccount, corpName, subscriptionId, spClientId, storageReady, ...setup }: Props) {
  const subtitle = setup.done ? "Terraform state container ready" : "Create the tfstate container and grant GitHub Actions access";

  return (
    <AppInsightsErrorBoundary onError={() => <p>Error: Unable to load component!</p>} appInsights={reactPlugin}>
      <StepWrapper title="Terraform Setup" subtitle={subtitle} status={status} expanded={expanded} onToggle={onToggle} disabled={disabled}>
        <TfBackendDetail
          {...setup}
          disabled={disabled}
          azureAccount={azureAccount}
          corpName={corpName}
          subscriptionId={subscriptionId}
          spClientId={spClientId}
          storageReady={storageReady}
        />
      </StepWrapper>
    </AppInsightsErrorBoundary>
  );
}
