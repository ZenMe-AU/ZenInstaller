import type { AccountInfo } from "@azure/msal-browser";
import type { CardStatus } from "../types";
import type { useCreateDomainSetup } from "../hooks/useCreateDomainSetup";
import type { Subscription } from "../api/azureGraph";
import CardLayout from "../components/CardLayout";
import CreateDomainDetail from "./CreateDomainDetail";
import { reactPlugin } from "../monitor/applicationInsights";
import { AppInsightsErrorBoundary } from "@microsoft/applicationinsights-react-js";

type Props = ReturnType<typeof useCreateDomainSetup> & {
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled: boolean;
  azureAccount: AccountInfo | null;
  corpName: string;
  dnsName: string;
  subscriptions: Subscription[];
};

export default function CreateDomain({ status, expanded, onToggle, disabled, azureAccount, corpName, dnsName, subscriptions, ...setup }: Props) {
  const subtitle = setup.resourcesDone
    ? setup.domainVerified
      ? setup.isPrimary
        ? "Resources created — domain verified and primary"
        : "Domain verified — set it as the primary domain"
      : "Resources created — waiting for domain verification"
    : setup.checkingStatus
      ? "Checking whether this domain is already set up..."
      : "Create the root resource group, DNS zone and private storage";

  return (
    <AppInsightsErrorBoundary onError={() => <p>Error: Unable to load component!</p>} appInsights={reactPlugin}>
      <CardLayout title="Corp Domain Setup" subtitle={subtitle} status={status} expanded={expanded} onToggle={onToggle} disabled={disabled}>
        <CreateDomainDetail
          {...setup}
          disabled={disabled}
          azureAccount={azureAccount}
          corpName={corpName}
          dnsName={dnsName}
          subscriptions={subscriptions}
        />
      </CardLayout>
    </AppInsightsErrorBoundary>
  );
}
