import type { Account, CardStatus, GhEnv } from "../types";
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
  account: Account | null;
  repoName: string;
  repoFullName: string | null;
  selectedEnv: GhEnv | null;
  onComplete: (done: boolean) => void;
};

export default function AzureSetupStep({
  status,
  expanded,
  onToggle,
  disabled,
  validEnvs,
  account,
  repoName,
  repoFullName,
  selectedEnv,
  onComplete,
  ...azureSetup
}: Props) {
  if (!AZURE_CLIENT_ID) return null;

  const subtitle = azureSetup.result
    ? "Identity created · review & save the values"
    : azureSetup.azureAccount
      ? `Signed in as ${azureSetup.azureAccount.username}`
      : "Give GitHub Actions access to deploy to Azure";

  const githubUrl =
    repoFullName && selectedEnv
      ? `https://github.com/${repoFullName}/settings/environments/${selectedEnv.id}/edit`
      : undefined;

  return (
    <StepWrapper title="Let GitHub deploy to Azure" subtitle={subtitle} status={status} expanded={expanded} onToggle={onToggle}>
      <AzureAppCard
        {...azureSetup}
        disabled={disabled}
        validEnvs={validEnvs}
        account={account}
        repoName={repoName}
        selectedEnv={selectedEnv}
        onComplete={onComplete}
        githubUrl={githubUrl}
      />
    </StepWrapper>
  );
}
