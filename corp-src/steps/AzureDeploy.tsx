import type { Account, CardStatus, GhEnv } from "../types";
import { AZURE_CLIENT_ID } from "../config/azureConfig";
import type { useAzureSetup } from "../hooks/useAzureSetup";
import StepWrapper from "../components/StepWrapper";
import AzureDeployDetail from "../cards/AzureDeployDetail";

import { reactPlugin } from "../monitor/applicationInsights";
import { AppInsightsErrorBoundary } from "@microsoft/applicationinsights-react-js";

type Props = ReturnType<typeof useAzureSetup> & {
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled: boolean;
  account: Account | null;
  repoName: string;
  repoFullName: string | null;
  selectedEnv: GhEnv | null;
  onComplete: (done: boolean) => void;
  onAzureValid?: (valid: boolean | null) => void;
};

export default function AzureDeploy({
  status,
  expanded,
  onToggle,
  disabled,
  account,
  repoName,
  repoFullName,
  selectedEnv,
  onComplete,
  onAzureValid,
  ...azureSetup
}: Props) {
  if (!AZURE_CLIENT_ID) return null;

  const subtitle =
    status === "complete"
      ? "Connection details already filled in"
      : azureSetup.azureAccount
        ? `Signed in as ${azureSetup.azureAccount.username}`
        : "Not yet connected — give GitHub Actions access to deploy to Azure";

  const githubUrl =
    repoFullName && selectedEnv
      ? `https://github.com/${repoFullName}/settings/environments/${selectedEnv.id}/edit`
      : undefined;

  return (
    <AppInsightsErrorBoundary onError={() => <p>Error: Unable to load component!</p>} appInsights={reactPlugin}>
    <StepWrapper title="Let GitHub deploy to Azure" subtitle={subtitle} status={status} expanded={expanded} onToggle={onToggle} disabled={disabled}>
      <AzureDeployDetail
        {...azureSetup}
        disabled={disabled}
        account={account}
        repoName={repoName}
        selectedEnv={selectedEnv}
        onComplete={onComplete}
        githubUrl={githubUrl}
        onAzureValid={onAzureValid}
      />
    </StepWrapper>
    </AppInsightsErrorBoundary>
  );
}
