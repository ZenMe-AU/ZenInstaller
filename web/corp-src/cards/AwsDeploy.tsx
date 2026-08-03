import type { Account, CardStatus, GhEnv } from "../types";
import type { useAwsSetup } from "../hooks/useAwsSetup";
import CardLayout from "../components/CardLayout";
import AwsDeployDetail from "./AwsDeployDetail";
import { reactPlugin } from "../monitor/applicationInsights";
import { AppInsightsErrorBoundary } from "@microsoft/applicationinsights-react-js";

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

export default function AwsDeploy({
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

  const githubUrl = repoFullName && selectedEnv ? `https://github.com/${repoFullName}/settings/environments/${selectedEnv.id}/edit` : undefined;

  return (
    <AppInsightsErrorBoundary onError={() => <p>Error: Unable to load component!</p>} appInsights={reactPlugin}>
      <CardLayout title="Let GitHub deploy to AWS" subtitle={subtitle} status={status} expanded={expanded} onToggle={onToggle} disabled={disabled}>
        <AwsDeployDetail
          {...awsSetup}
          account={account}
          repoName={repoName}
          selectedEnv={selectedEnv}
          disabled={disabled}
          onComplete={onComplete}
          githubUrl={githubUrl}
          onAwsValid={onAwsValid}
        />
      </CardLayout>
    </AppInsightsErrorBoundary>
  );
}
