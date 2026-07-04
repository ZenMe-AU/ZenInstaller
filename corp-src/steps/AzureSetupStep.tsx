import type { Account, CardStatus, GhEnv } from "../../access-pass-src/types";
import { AZURE_CLIENT_ID } from "../../access-pass-src/config/azureConfig";
import type { useAzureSetup } from "../hooks/useAzureSetup";
import StepWrapper from "../../corp-src/components/StepWrapper";
import AzureAppCard from "../cards/AzureAppCard";

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
};

export default function AzureSetupStep({
  status,
  expanded,
  onToggle,
  disabled,
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
    <StepWrapper title="Let GitHub deploy to Azure" subtitle={subtitle} status={status} expanded={expanded} onToggle={onToggle} disabled={disabled}>
      <AzureAppCard
        {...azureSetup}
        disabled={disabled}
        account={account}
        repoName={repoName}
        selectedEnv={selectedEnv}
        onComplete={onComplete}
        githubUrl={githubUrl}
      />
    </StepWrapper>
  );
}
